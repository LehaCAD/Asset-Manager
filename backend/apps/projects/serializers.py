from rest_framework import serializers
from .models import Project


class ProjectSerializer(serializers.ModelSerializer):
    """Сериализатор для модели Project."""
    
    boxes_count = serializers.SerializerMethodField()
    boxes_approved_count = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    
    class Meta:
        model = Project
        fields = ['id', 'name', 'status', 'status_display', 'aspect_ratio', 'boxes_count', 'boxes_approved_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_boxes_count(self, obj) -> int:
        """Получение количества сцен в проекте."""
        return obj.boxes.count()
    
    def get_boxes_approved_count(self, obj) -> int:
        """Получение количества утверждённых сцен."""
        return obj.boxes.filter(status='APPROVED').count()
    
    def get_status_display(self, obj) -> str:
        """Получение читаемого статуса."""
        return obj.get_status_display()
