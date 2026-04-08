from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Sum, Count, Value, DecimalField, BigIntegerField, Subquery, OuterRef
from django.db.models.functions import Coalesce, Abs

from .models import Project
from .serializers import ProjectSerializer, ProjectStatsSerializer
from apps.elements.models import Element
from apps.credits.models import CreditsTransaction
from apps.scenes.models import Scene
from apps.common.utils import format_storage


class IsOwner(permissions.BasePermission):
    """Пермишен: пользователь может работать только со своими проектами."""

    def has_object_permission(self, request, view, obj):
        return obj.user == request.user


class ProjectViewSet(viewsets.ModelViewSet):
    """
    ViewSet для CRUD операций с проектами.

    list: Получить список проектов текущего пользователя
    create: Создать новый проект
    retrieve: Получить детали проекта
    update: Обновить проект (PUT)
    partial_update: Частично обновить проект (PATCH)
    destroy: Удалить проект
    """
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated, IsOwner]

    def get_queryset(self):
        """Возвращает только проекты текущего пользователя с аннотациями метрик."""
        spent_subquery = Subquery(
            CreditsTransaction.objects.filter(
                element__project=OuterRef('pk'),
                reason=CreditsTransaction.REASON_GENERATION_DEBIT,
            ).values('element__project').annotate(
                total=Abs(Sum('amount'))
            ).values('total')[:1],
            output_field=DecimalField()
        )

        storage_subquery = Subquery(
            Element.objects.filter(
                project=OuterRef('pk'),
                file_size__isnull=False,
            ).values('project').annotate(
                total=Sum('file_size')
            ).values('total')[:1],
            output_field=BigIntegerField()
        )

        return Project.objects.filter(
            user=self.request.user
        ).annotate(
            _element_count=Count('elements'),
            _total_spent=Coalesce(spent_subquery, Value(0), output_field=DecimalField()),
            _storage_bytes=Coalesce(storage_subquery, Value(0), output_field=BigIntegerField()),
        ).prefetch_related('scenes')

    def perform_create(self, serializer):
        """При создании автоматически устанавливает текущего пользователя и проверяет лимиты."""
        user = self.request.user

        # Проверяем лимит проектов
        from apps.subscriptions.services import SubscriptionService
        if not SubscriptionService.can_create_project(user):
            plan = SubscriptionService.get_active_plan(user)
            raise PermissionDenied(
                f'Достигнут лимит проектов ({plan.max_projects}). Перейдите на другой тариф для увеличения.'
            )

        serializer.save(user=user)

    @action(detail=True, methods=['post'], url_path='reorder-items')
    def reorder_items(self, request, pk=None):
        """
        Reorder mixed grid of elements and groups.
        Accepts: item_order: [{type: "element", id: 1}, {type: "group", id: 2}, ...]
        """
        project = self.get_object()
        item_order = request.data.get('item_order', [])

        for index, item in enumerate(item_order):
            item_type = item.get('type')
            item_id = item.get('id')

            if item_type == 'element':
                Element.objects.filter(id=item_id, project=project).update(order_index=index)
            elif item_type == 'group':
                Scene.objects.filter(id=item_id, project=project).update(order_index=index)

        return Response({'status': 'ok'})

    @action(detail=True, methods=['post'])
    def presign(self, request, pk=None):
        """Generate presigned URLs for direct S3 upload at project level (no group)."""
        project = self.get_object()

        from apps.subscriptions.services import SubscriptionService
        if not SubscriptionService.check_storage(request.user):
            return Response({'detail': 'Хранилище заполнено. Перейдите на другой тариф.'}, status=status.HTTP_403_FORBIDDEN)

        from apps.storage.services import generate_upload_presigned_urls, validate_file_type, detect_element_type

        filename = request.data.get('filename', '')

        if not validate_file_type(filename):
            return Response(
                {'error': 'Неподдерживаемый формат файла'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        element_type = detect_element_type(filename)

        result = generate_upload_presigned_urls(
            project_id=project.id,
            scene_id=None,
            filename=filename,
            element_type=element_type,
        )

        # Calculate order_index (append to end, root-level elements only)
        current_count = Element.objects.filter(
            project=project, scene__isnull=True,
        ).count()

        # Create Element in UPLOADING status
        element = Element.objects.create(
            project=project,
            scene=None,
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

    @action(detail=True, methods=['post'])
    def generate(self, request, pk=None):
        """
        Запустить AI генерацию элемента на уровне проекта (без группы).

        POST /api/projects/{id}/generate/
        """
        project = self.get_object()
        from apps.elements.services import create_generation
        data, http_status = create_generation(
            project=project, scene=None,
            prompt=request.data.get('prompt'),
            ai_model_id=request.data.get('ai_model_id'),
            generation_config=request.data.get('generation_config', {}),
            user=request.user,
        )
        return Response(data, status=http_status)

    @action(detail=True, methods=['post'])
    def upload(self, request, pk=None):
        """
        Загрузить файл на уровне проекта (без группы).

        POST /api/projects/{id}/upload/
        """
        project = self.get_object()
        if 'file' not in request.FILES:
            return Response({'error': 'File is required'}, status=status.HTTP_400_BAD_REQUEST)
        from apps.elements.services import create_upload
        data, http_status = create_upload(
            project=project, scene=None,
            file=request.FILES['file'],
            prompt_text=request.data.get('prompt_text', ''),
            is_favorite=request.data.get('is_favorite', False),
            ai_model_id=request.data.get('ai_model'),
        )
        return Response(data, status=http_status)

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """
        Детальная статистика проекта.

        GET /api/projects/{id}/stats/
        """
        project = self.get_object()

        total_spent = CreditsTransaction.objects.filter(
            element__project=project,
            reason=CreditsTransaction.REASON_GENERATION_DEBIT,
        ).aggregate(total=Sum('amount'))['total'] or 0
        total_spent = abs(total_spent)

        elements_count = Element.objects.filter(project=project).count()

        storage_bytes = Element.objects.filter(
            project=project,
            file_size__isnull=False,
        ).aggregate(total=Sum('file_size'))['total'] or 0

        groups_count = Scene.objects.filter(project=project).count()

        last_tx = CreditsTransaction.objects.filter(
            element__project=project,
            reason=CreditsTransaction.REASON_GENERATION_DEBIT,
        ).select_related('element__ai_model').order_by('-created_at').first()

        data = {
            'total_spent': total_spent,
            'elements_count': elements_count,
            'storage_bytes': storage_bytes,
            'storage_display': format_storage(storage_bytes),
            'groups_count': groups_count,
            'last_generation_cost': abs(last_tx.amount) if last_tx else None,
            'last_generation_model': (
                last_tx.element.ai_model.name
                if last_tx and last_tx.element and last_tx.element.ai_model
                else None
            ),
        }
        return Response(ProjectStatsSerializer(data).data)
