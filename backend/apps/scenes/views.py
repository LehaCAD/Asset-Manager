import logging

from django.db.models import Count, Q, Sum, Value, DecimalField, BigIntegerField, Subquery, OuterRef, Prefetch
from django.db.models.functions import Coalesce, Abs
from rest_framework import viewsets, permissions, status

logger = logging.getLogger(__name__)
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import action

from .models import Scene
from .serializers import SceneSerializer, ReorderSerializer
from .services import reorder_scenes
from apps.credits.models import CreditsTransaction
from apps.elements.models import Element
from apps.common.utils import format_storage


class IsProjectOwner(permissions.BasePermission):
    """Пермишен: пользователь может работать только со сценами своих проектов."""
    
    def has_object_permission(self, request, view, obj):
        return obj.project.user == request.user


class SceneViewSet(viewsets.ModelViewSet):
    """
    ViewSet для CRUD операций со сценами.

    list: Получить список сцен пользователя (с фильтрацией по project)
    create: Создать новую сцену
    retrieve: Получить детали сцены
    update: Обновить сцену (PUT)
    partial_update: Частично обновить сцену (PATCH)
    destroy: Удалить сцену (CASCADE: удаляет все элементы и дочерние группы)
    """
    serializer_class = SceneSerializer
    permission_classes = [IsAuthenticated, IsProjectOwner]

    def destroy(self, request, *args, **kwargs):
        """
        Удаление группы со всем содержимым.

        Явно удаляем элементы и дочерние группы, чтобы CASCADE
        работал надёжно независимо от DB-level constraint.
        S3 файлы чистятся перед удалением записей из БД.
        """
        scene = self.get_object()
        from apps.elements.models import Element
        from apps.storage.services import delete_file_from_s3

        # Collect all descendant scene IDs (children, grandchildren, etc.)
        descendant_ids = []
        queue = list(scene.children.values_list('id', flat=True))
        while queue:
            current_id = queue.pop()
            descendant_ids.append(current_id)
            child_ids = list(Scene.objects.filter(parent_id=current_id).values_list('id', flat=True))
            queue.extend(child_ids)

        # Collect all scene IDs (this scene + descendants)
        all_scene_ids = [scene.id] + descendant_ids

        # Collect S3 file URLs before deletion
        elements_to_clean = Element.objects.filter(
            scene_id__in=all_scene_ids
        ).values_list('file_url', 'thumbnail_url')

        s3_urls = []
        for file_url, thumbnail_url in elements_to_clean:
            if file_url:
                s3_urls.append(file_url)
            if thumbnail_url:
                s3_urls.append(thumbnail_url)

        # Delete elements from DB
        if descendant_ids:
            Element.objects.filter(scene_id__in=descendant_ids).delete()
        Element.objects.filter(scene=scene).delete()

        # Delete descendant scenes
        if descendant_ids:
            Scene.objects.filter(id__in=descendant_ids).delete()

        # Delete the scene itself
        scene.delete()

        # Clean up S3 files (best-effort, after DB commit)
        for url in s3_urls:
            try:
                delete_file_from_s3(url)
            except Exception:
                logger.warning("Failed to delete S3 file: %s", url)

        return Response(status=status.HTTP_204_NO_CONTENT)
    
    def get_queryset(self):
        """Возвращает только сцены проектов текущего пользователя с фильтрацией."""
        # total_spent и storage с учётом вложенных групп (до 3 уровней)
        descendant_scenes = Q(element__scene=OuterRef('pk')) | Q(element__scene__parent=OuterRef('pk')) | Q(element__scene__parent__parent=OuterRef('pk')) | Q(element__scene__parent__parent__parent=OuterRef('pk'))
        spent_subquery = Subquery(
            CreditsTransaction.objects.filter(
                descendant_scenes,
                reason=CreditsTransaction.REASON_GENERATION_DEBIT,
            ).order_by().values(
                dummy=Value(1)
            ).annotate(
                total=Abs(Sum('amount'))
            ).values('total')[:1],
            output_field=DecimalField()
        )

        descendant_elements = Q(scene=OuterRef('pk')) | Q(scene__parent=OuterRef('pk')) | Q(scene__parent__parent=OuterRef('pk')) | Q(scene__parent__parent__parent=OuterRef('pk'))
        storage_subquery = Subquery(
            Element.objects.filter(
                descendant_elements,
            ).order_by().values(
                dummy=Value(1)
            ).annotate(
                total=Sum('file_size')
            ).values('total')[:1],
            output_field=BigIntegerField()
        )

        queryset = Scene.objects.filter(
            project__user=self.request.user
        ).annotate(
            _children_count=Count('children', distinct=True),
            _elements_count=Count('elements', distinct=True),
            _total_spent=Coalesce(spent_subquery, Value(0), output_field=DecimalField()),
            _storage_bytes=Coalesce(storage_subquery, Value(0), output_field=BigIntegerField()),
        ).select_related('project', 'headliner', 'parent').prefetch_related(
            Prefetch(
                'elements',
                queryset=Element.objects.filter(status='COMPLETED').exclude(file_url='').order_by('-created_at'),
                to_attr='_preview_elements'
            )
        )

        # Фильтрация по project через query params
        project_id = self.request.query_params.get('project', None)
        if project_id is not None:
            queryset = queryset.filter(project_id=project_id)

        # Фильтрация по parent
        parent_id = self.request.query_params.get('parent')
        parent_null = self.request.query_params.get('parent__isnull')
        if parent_id:
            queryset = queryset.filter(parent_id=parent_id)
        if parent_null == 'true':
            queryset = queryset.filter(parent__isnull=True)

        return queryset
    
    def create(self, request, *args, **kwargs):
        """
        Переопределяем create для проверки, что project принадлежит пользователю и проверки лимитов.
        """
        project_id = request.data.get('project')
        
        if not project_id:
            return Response(
                {'project': ['This field is required.']},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Проверка, что project принадлежит текущему пользователю
        from apps.projects.models import Project
        try:
            project = Project.objects.get(id=project_id, user=request.user)
        except Project.DoesNotExist:
            return Response(
                {'project': ['Project not found or you do not have permission.']},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Проверяем лимит групп в проекте
        from apps.subscriptions.services import SubscriptionService
        if not SubscriptionService.can_create_scene(request.user, project):
            plan = SubscriptionService.get_active_plan(request.user)
            return Response(
                {'detail': f'Достигнут лимит групп в проекте ({plan.max_scenes_per_project}). Перейдите на другой тариф.'},
                status=status.HTTP_403_FORBIDDEN
            )

        return super().create(request, *args, **kwargs)
    
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsProjectOwner])
    def upload(self, request, pk=None):
        """
        Загрузить файл на S3 и создать Element.

        POST /api/scenes/{id}/upload/
        """
        scene = self.get_object()
        if 'file' not in request.FILES:
            return Response({'error': 'File is required'}, status=status.HTTP_400_BAD_REQUEST)
        from apps.elements.services import create_upload
        data, http_status = create_upload(
            project=scene.project, scene=scene,
            file=request.FILES['file'],
            prompt_text=request.data.get('prompt_text', ''),
            is_favorite=request.data.get('is_favorite', False),
            ai_model_id=request.data.get('ai_model'),
        )
        return Response(data, status=http_status)
    
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsProjectOwner])
    def presign(self, request, pk=None):
        """Generate presigned URLs for direct S3 upload."""
        scene = self.get_object()

        from apps.subscriptions.services import SubscriptionService
        if not SubscriptionService.check_storage(request.user):
            return Response({'detail': 'Хранилище заполнено. Перейдите на другой тариф.'}, status=status.HTTP_403_FORBIDDEN)

        from apps.storage.services import generate_upload_presigned_urls, validate_file_type, detect_element_type
        from apps.elements.models import Element

        filename = request.data.get('filename', '')

        if not validate_file_type(filename):
            return Response(
                {'error': 'Неподдерживаемый формат файла'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        element_type = detect_element_type(filename)

        result = generate_upload_presigned_urls(
            project_id=scene.project_id,
            scene_id=scene.id,
            filename=filename,
            element_type=element_type,
        )

        # Calculate order_index (append to end)
        current_count = Element.objects.filter(
            project=scene.project, scene=scene,
        ).count()

        # Create Element in UPLOADING status
        element = Element.objects.create(
            project=scene.project,
            scene=scene,
            element_type=element_type,
            status=Element.STATUS_UPLOADING,
            source_type=Element.SOURCE_UPLOADED,
            upload_keys=result['upload_keys'],
            prompt_text=request.data.get('prompt_text', ''),
            order_index=current_count,
            original_filename=request.data.get('filename', ''),
        )

        return Response({
            'element_id': element.id,
            **result,
        })

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsProjectOwner])
    def generate(self, request, pk=None):
        """
        Запустить AI генерацию элемента.

        POST /api/scenes/{id}/generate/
        """
        scene = self.get_object()
        from apps.elements.services import create_generation
        data, http_status = create_generation(
            project=scene.project, scene=scene,
            prompt=request.data.get('prompt'),
            ai_model_id=request.data.get('ai_model_id'),
            generation_config=request.data.get('generation_config', {}),
            user=request.user,
        )
        return Response(data, status=http_status)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsProjectOwner])
    def set_headliner(self, request, pk=None):
        """
        Назначить лучший элемент для сцены.
        
        POST /api/scenes/{id}/set_headliner/
        
        Принимает:
        - element_id: ID элемента (обязательно). Передать null для сброса.
        """
        scene = self.get_object()
        element_id = request.data.get('element_id')

        if element_id is None:
            scene.headliner = None
            scene.save(update_fields=['headliner', 'updated_at'])
            return Response(SceneSerializer(scene).data)

        from apps.elements.models import Element
        try:
            element = Element.objects.get(id=element_id, scene=scene)
        except Element.DoesNotExist:
            return Response(
                {'error': 'Элемент не найден или не принадлежит этой группе.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        scene.headliner = element
        scene.save(update_fields=['headliner', 'updated_at'])
        return Response(SceneSerializer(scene).data)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def reorder(self, request):
        """
        Изменить порядок сцен.
        
        POST /api/scenes/reorder/
        
        Принимает:
        - scene_ids: [1, 3, 2, ...] — список ID сцен в новом порядке
        """
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        scene_ids = serializer.validated_data['scene_ids']

        # Проверяем, что все сцены принадлежат пользователю
        user_scene_ids = set(
            Scene.objects.filter(
                project__user=request.user,
                id__in=scene_ids
            ).values_list('id', flat=True)
        )
        if set(scene_ids) != user_scene_ids:
            return Response(
                {'error': 'Некоторые группы не найдены или не принадлежат вам.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reorder_scenes(scene_ids)
        return Response({'status': 'ok'})

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """
        Детальная статистика группы.

        GET /api/scenes/{id}/stats/
        """
        scene = self.get_object()

        total_spent = CreditsTransaction.objects.filter(
            element__scene=scene,
            reason=CreditsTransaction.REASON_GENERATION_DEBIT,
        ).aggregate(total=Sum('amount'))['total'] or 0
        total_spent = abs(total_spent)

        elements_count = Element.objects.filter(scene=scene).count()

        storage_bytes = Element.objects.filter(
            scene=scene,
            file_size__isnull=False,
        ).aggregate(total=Sum('file_size'))['total'] or 0

        from .serializers import SceneStatsSerializer
        return Response(SceneStatsSerializer({
            'total_spent': total_spent,
            'elements_count': elements_count,
            'storage_bytes': storage_bytes,
            'storage_display': format_storage(storage_bytes),
        }).data)

    @action(detail=True, methods=['get'], url_path='delete-info')
    def delete_info(self, request, pk=None):
        """Return counts for deletion confirmation dialog."""
        scene = self.get_object()
        from apps.elements.models import Element
        children = scene.children.all()
        child_element_count = Element.objects.filter(scene__in=children).count()

        return Response({
            'element_count': scene.elements.count(),
            'children_count': children.count(),
            'child_element_count': child_element_count,
            'total_elements_affected': scene.elements.count() + child_element_count,
        })
