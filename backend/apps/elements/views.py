import logging
import requests

from django.http import StreamingHttpResponse
from django.db.models import Sum, Subquery, OuterRef, DecimalField
from django.db.models.functions import Abs
from rest_framework import viewsets, permissions, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import Element
from .serializers import ElementSerializer, ReorderSerializer
from .services import reorder_elements
from apps.scenes.s3_utils import delete_file_from_s3
from apps.credits.models import CreditsTransaction

logger = logging.getLogger(__name__)


class IsSceneProjectOwner(permissions.BasePermission):
    """Пермишен: пользователь может работать только с элементами своих проектов."""

    def has_object_permission(self, request, view, obj):
        return obj.project.user == request.user


class ElementViewSet(viewsets.ModelViewSet):
    """
    ViewSet для CRUD операций с элементами.
    
    list: Получить список элементов пользователя (с фильтрацией)
    create: Создать новый элемент
    retrieve: Получить детали элемента
    update: Обновить элемент (PUT)
    partial_update: Частично обновить элемент (PATCH)
    destroy: Удалить элемент
    """
    serializer_class = ElementSerializer
    permission_classes = [IsAuthenticated, IsSceneProjectOwner]
    
    def perform_destroy(self, instance):
        """Удаление элемента с очисткой файлов из S3 и headliner."""
        logger.info(f"Deleting element {instance.id}: file_url={instance.file_url}, thumbnail_url={instance.thumbnail_url}")

        # Clear headliner reference if this element is the headliner
        if instance.scene and instance.scene.headliner_id == instance.id:
            instance.scene.headliner = None
            instance.scene.save(update_fields=['headliner', 'updated_at'])

        # Удаляем основной файл из S3
        if instance.file_url:
            result = delete_file_from_s3(instance.file_url)
            logger.info(f"Deleted main file for element {instance.id}: success={result}")

        # Удаляем превью из S3
        if instance.thumbnail_url:
            result = delete_file_from_s3(instance.thumbnail_url)
            logger.info(f"Deleted thumbnail for element {instance.id}: success={result}")

        instance.delete()
        logger.info(f"Element {instance.id} deleted successfully")
    
    def get_queryset(self):
        """Возвращает только элементы проектов текущего пользователя с фильтрацией."""
        queryset = Element.objects.filter(
            project__user=self.request.user
        ).select_related('project', 'scene', 'ai_model')

        # Фильтрация по scene через query params
        scene_id = self.request.query_params.get('scene')
        project_id = self.request.query_params.get('project')
        scene_null = self.request.query_params.get('scene__isnull')

        if scene_id:
            queryset = queryset.filter(scene_id=scene_id)
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        if scene_null == 'true':
            queryset = queryset.filter(scene__isnull=True)

        # Фильтрация по element_type
        element_type = self.request.query_params.get('element_type')
        if element_type:
            queryset = queryset.filter(element_type=element_type)

        # Фильтрация по is_favorite
        is_favorite = self.request.query_params.get('is_favorite')
        if is_favorite is not None:
            queryset = queryset.filter(is_favorite=is_favorite.lower() == 'true')

        queryset = queryset.annotate(
            _generation_cost=Subquery(
                CreditsTransaction.objects.filter(
                    element=OuterRef('pk'),
                    reason=CreditsTransaction.REASON_GENERATION_DEBIT,
                ).values('element').annotate(
                    cost=Abs(Sum('amount'))
                ).values('cost')[:1],
                output_field=DecimalField()
            )
        )

        return queryset.order_by('order_index', 'created_at')
    
    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def reorder(self, request):
        """
        Изменить порядок элементов.
        
        POST /api/elements/reorder/
        
        Принимает:
        - element_ids: [1, 3, 2, ...] — список ID элементов в новом порядке
        """
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        element_ids = serializer.validated_data['element_ids']

        # Проверяем, что все элементы принадлежат пользователю
        user_element_ids = set(
            Element.objects.filter(
                project__user=request.user,
                id__in=element_ids
            ).values_list('id', flat=True)
        )
        if set(element_ids) != user_element_ids:
            return Response(
                {'error': 'Некоторые элементы не найдены или не принадлежат вам.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reorder_elements(element_ids)
        return Response({'status': 'ok'})

    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated])
    def download(self, request, pk=None):
        """
        Proxy-скачивание файла элемента.
        GET /api/elements/{id}/download/
        """
        element = self.get_object()
        if not element.file_url:
            return Response(
                {'error': 'Файл не найден'},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            r = requests.get(element.file_url, stream=True, timeout=30)
            r.raise_for_status()
        except requests.RequestException:
            return Response(
                {'error': 'Не удалось скачать файл'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        ext = element.file_url.rsplit('.', 1)[-1].split('?')[0] if '.' in element.file_url else 'file'
        filename = f'element-{element.id}.{ext}'
        content_type = r.headers.get('Content-Type', 'application/octet-stream')

        response = StreamingHttpResponse(
            r.iter_content(chunk_size=8192),
            content_type=content_type,
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        if 'Content-Length' in r.headers:
            response['Content-Length'] = r.headers['Content-Length']
        return response

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def move(self, request):
        """
        Переместить элементы и/или группы в другую группу (или на root уровень).

        POST /api/elements/move/

        Принимает:
        - element_ids: [1, 2, ...] — ID элементов для перемещения
        - group_ids: [3, 4, ...] — ID групп для перемещения
        - target_scene: ID целевой группы (null = root уровень проекта)
        """
        element_ids = request.data.get('element_ids', [])
        group_ids = request.data.get('group_ids', [])
        target_scene_id = request.data.get('target_scene')  # null = root

        target_scene = None
        if target_scene_id is not None:
            from apps.scenes.models import Scene
            try:
                target_scene = Scene.objects.get(id=target_scene_id, project__user=request.user)
            except Scene.DoesNotExist:
                return Response(
                    {'error': 'Целевая группа не найдена'},
                    status=status.HTTP_404_NOT_FOUND,
                )

        if element_ids:
            Element.objects.filter(
                id__in=element_ids, project__user=request.user
            ).update(scene_id=target_scene_id)

        if group_ids:
            from apps.scenes.models import Scene
            groups = Scene.objects.filter(id__in=group_ids, project__user=request.user)
            if target_scene and target_scene.parent is not None:
                return Response(
                    {'error': 'Нельзя переместить: превышена максимальная вложенность'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if target_scene:
                groups_with_children = groups.filter(children__isnull=False).distinct()
                if groups_with_children.exists():
                    return Response(
                        {'error': 'Нельзя переместить группу с подгруппами внутрь другой группы'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            groups.update(parent_id=target_scene_id)

        return Response({'status': 'ok'})
