from rest_framework import viewsets, permissions, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import Asset
from .serializers import AssetSerializer, ReorderSerializer
from .services import reorder_assets
from apps.boxes.s3_utils import delete_file_from_s3


class IsBoxProjectOwner(permissions.BasePermission):
    """Пермишен: пользователь может работать только с элементами сцен своих проектов."""
    
    def has_object_permission(self, request, view, obj):
        return obj.box.project.user == request.user


class AssetViewSet(viewsets.ModelViewSet):
    """
    ViewSet для CRUD операций с элементами.
    
    list: Получить список элементов пользователя (с фильтрацией)
    create: Создать новый элемент
    retrieve: Получить детали элемента
    update: Обновить элемент (PUT)
    partial_update: Частично обновить элемент (PATCH)
    destroy: Удалить элемент
    """
    serializer_class = AssetSerializer
    permission_classes = [IsAuthenticated, IsBoxProjectOwner]
    
    def perform_destroy(self, instance):
        """Удаление элемента с очисткой файлов из S3."""
        # Удаляем основной файл из S3
        if instance.file_url:
            delete_file_from_s3(instance.file_url)
        # Удаляем превью из S3
        if instance.thumbnail_url:
            delete_file_from_s3(instance.thumbnail_url)
        instance.delete()
    
    def get_queryset(self):
        """Возвращает только элементы сцен проектов текущего пользователя с фильтрацией."""
        queryset = Asset.objects.filter(
            box__project__user=self.request.user
        ).select_related('box', 'box__project', 'ai_model')
        
        # Фильтрация по box через query params
        box_id = self.request.query_params.get('box', None)
        if box_id is not None:
            queryset = queryset.filter(box_id=box_id)
        
        # Фильтрация по asset_type
        asset_type = self.request.query_params.get('asset_type', None)
        if asset_type is not None:
            queryset = queryset.filter(asset_type=asset_type)
        
        # Фильтрация по is_favorite
        is_favorite = self.request.query_params.get('is_favorite', None)
        if is_favorite is not None:
            # Преобразование строки в boolean
            is_fav_bool = is_favorite.lower() in ('true', '1', 'yes')
            queryset = queryset.filter(is_favorite=is_fav_bool)
        
        return queryset
    
    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def reorder(self, request):
        """
        Изменить порядок элементов.
        
        POST /api/assets/reorder/
        
        Принимает:
        - asset_ids: [1, 3, 2, ...] — список ID элементов в новом порядке
        """
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        asset_ids = serializer.validated_data['asset_ids']

        # Проверяем, что все элементы принадлежат пользователю
        user_asset_ids = set(
            Asset.objects.filter(
                box__project__user=request.user,
                id__in=asset_ids
            ).values_list('id', flat=True)
        )
        if set(asset_ids) != user_asset_ids:
            return Response(
                {'error': 'Некоторые элементы не найдены или не принадлежат вам.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reorder_assets(asset_ids)
        return Response({'status': 'ok'})
