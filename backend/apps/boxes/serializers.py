from rest_framework import serializers
from .models import Box


class BoxSerializer(serializers.ModelSerializer):
    """Сериализатор для модели Box."""
    
    assets_count = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    headliner_url = serializers.SerializerMethodField()
    headliner_thumbnail_url = serializers.SerializerMethodField()
    headliner_type = serializers.SerializerMethodField()
    
    class Meta:
        model = Box
        fields = [
            'id', 
            'project', 
            'project_name',
            'name', 
            'order_index',
            'headliner',
            'headliner_url',
            'headliner_thumbnail_url',
            'headliner_type',
            'assets_count',
            'created_at', 
            'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_assets_count(self, obj: Box) -> int:
        """Получение количества ассетов в боксе."""
        return obj.assets.count()
    
    def get_project_name(self, obj: Box) -> str:
        """Получение названия проекта."""
        return obj.project.name

    def get_headliner_url(self, obj: Box) -> str:
        """URL файла хедлайнера для обложки бокса."""
        if obj.headliner:
            return obj.headliner.file_url
        return ''

    def get_headliner_thumbnail_url(self, obj: Box) -> str:
        """URL превью хедлайнера."""
        if obj.headliner:
            return obj.headliner.thumbnail_url or obj.headliner.file_url
        return ''

    def get_headliner_type(self, obj: Box) -> str:
        """Тип хедлайнера (IMAGE/VIDEO) — нужен фронту для hover-проигрывания."""
        if obj.headliner:
            return obj.headliner.asset_type
        return ''


class ReorderSerializer(serializers.Serializer):
    """Сериализатор для изменения порядка боксов."""
    box_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text='Список ID боксов в новом порядке'
    )
