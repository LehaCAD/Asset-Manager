from rest_framework import serializers
from .models import Box


class BoxSerializer(serializers.ModelSerializer):
    """Сериализатор для модели Box."""
    
    assets_count = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Box
        fields = [
            'id', 
            'project', 
            'project_name',
            'name', 
            'order_index', 
            'assets_count',
            'created_at', 
            'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_assets_count(self, obj) -> int:
        """Получение количества ассетов в боксе."""
        return obj.assets.count()
    
    def get_project_name(self, obj) -> str:
        """Получение названия проекта."""
        return obj.project.name
