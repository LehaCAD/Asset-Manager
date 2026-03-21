from django.db.models import Count
from rest_framework import viewsets, permissions, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import action

from .models import Scene
from .serializers import SceneSerializer, ReorderSerializer
from .services import reorder_scenes


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
        """
        scene = self.get_object()
        from apps.elements.models import Element

        # Collect all descendant scene IDs (children, grandchildren, etc.)
        descendant_ids = []
        queue = list(scene.children.values_list('id', flat=True))
        while queue:
            current_id = queue.pop()
            descendant_ids.append(current_id)
            child_ids = list(Scene.objects.filter(parent_id=current_id).values_list('id', flat=True))
            queue.extend(child_ids)

        # Delete elements in descendant scenes
        if descendant_ids:
            Element.objects.filter(scene_id__in=descendant_ids).delete()

        # Delete elements in this scene
        Element.objects.filter(scene=scene).delete()

        # Delete descendant scenes (bottom-up order not needed since we already deleted elements)
        if descendant_ids:
            Scene.objects.filter(id__in=descendant_ids).delete()

        # Delete the scene itself
        scene.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    
    def get_queryset(self):
        """Возвращает только сцены проектов текущего пользователя с фильтрацией."""
        queryset = Scene.objects.filter(
            project__user=self.request.user
        ).annotate(
            _children_count=Count('children')
        ).select_related('project', 'headliner', 'parent').prefetch_related('elements')

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
        
        # # Проверяем лимит сцен в проекте
        # user_quota = request.user.quota
        # current_scenes_count = Scene.objects.filter(project=project).count()
        # if current_scenes_count >= user_quota.max_scenes_per_project:
        #     return Response(
        #         {'detail': f'Достигнут лимит групп в проекте ({user_quota.max_scenes_per_project}). Обратитесь к администратору.'},
        #         status=status.HTTP_403_FORBIDDEN
        #     )
        #
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
