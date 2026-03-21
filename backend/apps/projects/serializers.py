from rest_framework import serializers
from .models import Project


class ProjectSerializer(serializers.ModelSerializer):
    """Сериализатор для модели Project."""

    scenes_count = serializers.SerializerMethodField()
    scenes_approved_count = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    element_count = serializers.SerializerMethodField()
    total_spent = serializers.SerializerMethodField()
    storage_bytes = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = ['id', 'name', 'status', 'status_display', 'aspect_ratio',
                  'scenes_count', 'scenes_approved_count',
                  'element_count', 'total_spent', 'storage_bytes',
                  'created_at', 'updated_at']
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

    def get_element_count(self, obj) -> int:
        return getattr(obj, '_element_count', 0)

    def get_total_spent(self, obj) -> str:
        val = getattr(obj, '_total_spent', None)
        return str(val) if val else '0'

    def get_storage_bytes(self, obj) -> int:
        return getattr(obj, '_storage_bytes', None) or 0


class ProjectStatsSerializer(serializers.Serializer):
    """Detailed stats for a single project."""
    total_spent = serializers.DecimalField(max_digits=12, decimal_places=2)
    elements_count = serializers.IntegerField()
    storage_bytes = serializers.IntegerField()
    storage_display = serializers.CharField()
    groups_count = serializers.IntegerField()
    last_generation_cost = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)
    last_generation_model = serializers.CharField(allow_null=True)
