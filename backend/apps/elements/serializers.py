from rest_framework import serializers
from .models import Element


class ElementSerializer(serializers.ModelSerializer):
    """Сериализатор для модели Element."""
    
    scene_name = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    group_name = serializers.SerializerMethodField()
    ai_model_name = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    source_type_display = serializers.SerializerMethodField()
    file_size = serializers.IntegerField(read_only=True, allow_null=True)
    generation_cost = serializers.SerializerMethodField()
    review_summary = serializers.SerializerMethodField()

    class Meta:
        model = Element
        fields = [
            'id',
            'project',
            'project_name',
            'scene',
            'scene_name',
            'group_name',
            'element_type',
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
            'external_task_id',
            'file_size',
            'generation_cost',
            'approval_status',
            'original_filename',
            'review_summary',
            'preview_url',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'external_task_id', 'review_summary']

    def get_scene_name(self, obj) -> str:
        """Получение названия сцены."""
        return obj.scene.name if obj.scene else None

    def get_project_name(self, obj) -> str:
        """Получение названия проекта."""
        return obj.project.name

    def get_group_name(self, obj):
        """Получение названия группы (сцены)."""
        return obj.scene.name if obj.scene else None
    
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

    def get_generation_cost(self, obj) -> str | None:
        val = getattr(obj, '_generation_cost', None)
        return str(val) if val else None

    def get_review_summary(self, obj):
        """Return worst-wins review: rejected > changes_requested > approved."""
        reviews = list(obj.reviews.all())  # uses prefetch cache
        if not reviews:
            return None
        priority = {'rejected': 0, 'changes_requested': 1, 'approved': 2}
        worst = min(reviews, key=lambda r: priority.get(r.action, 99))
        return {'action': worst.action, 'author_name': worst.author_name}


class ReorderSerializer(serializers.Serializer):
    """Сериализатор для изменения порядка элементов."""
    element_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text='Список ID элементов в новом порядке'
    )
