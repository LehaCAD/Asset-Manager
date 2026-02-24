from rest_framework import serializers
from .models import Project


class ProjectSerializer(serializers.ModelSerializer):
    """Сериализатор для модели Project."""
    
    scenes_count = serializers.SerializerMethodField()
    scenes_approved_count = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    
    class Meta:
        model = Project
        fields = ['id', 'name', 'status', 'status_display', 'aspect_ratio', 'scenes_count', 'scenes_approved_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_scenes_count(self, obj) -> int:
        """Получение количества сцен в проекте."""
        return obj.scenes.count()
    
    def get_scenes_approved_count(self, obj) -> int:
        """Получение количества утверждённых сцен."""
        return obj.scenes.filter(status='APPROVED').count()
    
    def get_status_display(self, obj) -> str:
        """Получение читаемого статуса."""
        return obj.get_status_display()
