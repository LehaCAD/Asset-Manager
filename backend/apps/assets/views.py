from rest_framework import viewsets, permissions
from rest_framework.permissions import IsAuthenticated
from .models import Asset
from .serializers import AssetSerializer


class IsBoxProjectOwner(permissions.BasePermission):
    """Пермишен: пользователь может работать только с ассетами боксов своих проектов."""
    
    def has_object_permission(self, request, view, obj):
        return obj.box.project.user == request.user


class AssetViewSet(viewsets.ModelViewSet):
    """
    ViewSet для CRUD операций с ассетами.
    
    list: Получить список ассетов пользователя (с фильтрацией)
    create: Создать новый ассет
    retrieve: Получить детали ассета
    update: Обновить ассет (PUT)
    partial_update: Частично обновить ассет (PATCH)
    destroy: Удалить ассет
    """
    serializer_class = AssetSerializer
    permission_classes = [IsAuthenticated, IsBoxProjectOwner]
    
    def get_queryset(self):
        """Возвращает только ассеты боксов проектов текущего пользователя с фильтрацией."""
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
