from rest_framework import serializers
from .models import Asset


class AssetSerializer(serializers.ModelSerializer):
    """Сериализатор для модели Asset."""
    
    box_name = serializers.SerializerMethodField()
    ai_model_name = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    source_type_display = serializers.SerializerMethodField()
    
    class Meta:
        model = Asset
        fields = [
            'id',
            'box',
            'box_name',
            'asset_type',
            'order_index',
            'file_url',
            'thumbnail_url',
            'is_favorite',
            'prompt_text',
            'ai_model',
            'ai_model_name',
            'generation_config',
            'seed',
            'status',
            'status_display',
            'error_message',
            'source_type',
            'source_type_display',
            'parent_asset',
            'external_task_id',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'external_task_id']
    
    def get_box_name(self, obj) -> str:
        """Получение названия сцены."""
        return obj.box.name
    
    def get_ai_model_name(self, obj) -> str:
        """Получение названия AI модели."""
        if obj.ai_model:
            return obj.ai_model.name
        return None
    
    def get_status_display(self, obj) -> str:
        """Получение читаемого статуса."""
        return obj.get_status_display()
    
    def get_source_type_display(self, obj) -> str:
        """Получение читаемого типа источника."""
        return obj.get_source_type_display()


class ReorderSerializer(serializers.Serializer):
    """Сериализатор для изменения порядка элементов."""
    asset_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text='Список ID элементов в новом порядке'
    )
