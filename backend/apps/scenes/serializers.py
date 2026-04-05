from rest_framework import serializers
from .models import Scene


class SceneSerializer(serializers.ModelSerializer):
    """Сериализатор для модели Scene."""

    elements_count = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    headliner_url = serializers.SerializerMethodField()
    headliner_thumbnail_url = serializers.SerializerMethodField()
    headliner_type = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    parent = serializers.PrimaryKeyRelatedField(
        queryset=Scene.objects.all(),
        required=False,
        allow_null=True
    )
    parent_name = serializers.SerializerMethodField()
    children_count = serializers.SerializerMethodField()
    depth = serializers.SerializerMethodField()
    total_spent = serializers.SerializerMethodField()
    storage_bytes = serializers.SerializerMethodField()
    preview_thumbnails = serializers.SerializerMethodField()

    class Meta:
        model = Scene
        fields = [
            'id',
            'project',
            'project_name',
            'name',
            'parent',
            'parent_name',
            'children_count',
            'depth',
            'status',
            'status_display',
            'order_index',
            'headliner',
            'headliner_url',
            'headliner_thumbnail_url',
            'headliner_type',
            'elements_count',
            'total_spent',
            'storage_bytes',
            'preview_thumbnails',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def validate_parent(self, value):
        if value and value.parent is not None:
            raise serializers.ValidationError(
                'Максимальная вложенность — 2 уровня.'
            )
        return value

    def get_parent_name(self, obj):
        return obj.parent.name if obj.parent else None

    def get_children_count(self, obj):
        # Use annotated value to avoid N+1
        return getattr(obj, '_children_count', obj.children.count())

    def get_depth(self, obj):
        return 1 if obj.parent else 0

    def get_elements_count(self, obj: Scene) -> int:
        """Получение количества элементов в сцене."""
        return getattr(obj, '_elements_count', obj.elements.count())
    
    def get_project_name(self, obj: Scene) -> str:
        """Получение названия проекта."""
        return obj.project.name

    def get_headliner_url(self, obj: Scene) -> str:
        """URL файла лучшего элемента для обложки сцены."""
        if obj.headliner:
            return obj.headliner.file_url
        return ''

    def get_headliner_thumbnail_url(self, obj: Scene) -> str:
        """URL превью лучшего элемента (800px preview)."""
        if obj.headliner:
            return obj.headliner.preview_url or obj.headliner.thumbnail_url or obj.headliner.file_url
        return ''

    def get_headliner_type(self, obj: Scene) -> str:
        """Тип лучшего элемента (IMAGE/VIDEO) — нужен фронту для hover-проигрывания."""
        if obj.headliner:
            return obj.headliner.element_type
        return ''
    
    def get_status_display(self, obj: Scene) -> str:
        """Получение читаемого статуса."""
        return obj.get_status_display()

    def get_total_spent(self, obj) -> str:
        val = getattr(obj, '_total_spent', None)
        return str(val) if val else '0'

    def get_storage_bytes(self, obj) -> int:
        return getattr(obj, '_storage_bytes', None) or 0

    def get_preview_thumbnails(self, obj) -> list[str]:
        """First 4 element preview URLs (800px) for preview grid."""
        if hasattr(obj, '_preview_elements'):
            elements = obj._preview_elements[:4]
        else:
            elements = obj.elements.filter(
                status='COMPLETED'
            ).exclude(
                file_url=''
            ).order_by('-created_at')[:4]
        return [
            e.preview_url or e.thumbnail_url or e.file_url
            for e in elements
            if e.file_url
        ]


class SceneStatsSerializer(serializers.Serializer):
    """Detailed stats for a single scene/group."""
    total_spent = serializers.DecimalField(max_digits=12, decimal_places=2)
    elements_count = serializers.IntegerField()
    storage_bytes = serializers.IntegerField()
    storage_display = serializers.CharField()


class ReorderSerializer(serializers.Serializer):
    """Сериализатор для изменения порядка групп."""
    scene_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text='Список ID групп в новом порядке'
    )
