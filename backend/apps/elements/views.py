import logging

from rest_framework import viewsets, permissions, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import Element
from .serializers import ElementSerializer, ReorderSerializer
from .services import reorder_elements
from apps.scenes.s3_utils import delete_file_from_s3

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
        """Удаление элемента с очисткой файлов из S3."""
        logger.info(f"Deleting element {instance.id}: file_url={instance.file_url}, thumbnail_url={instance.thumbnail_url}")
        
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
