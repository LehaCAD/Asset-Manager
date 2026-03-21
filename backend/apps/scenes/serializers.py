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
        return obj.elements.count()
    
    def get_project_name(self, obj: Scene) -> str:
        """Получение названия проекта."""
        return obj.project.name

    def get_headliner_url(self, obj: Scene) -> str:
        """URL файла лучшего элемента для обложки сцены."""
        if obj.headliner:
            return obj.headliner.file_url
        return ''

    def get_headliner_thumbnail_url(self, obj: Scene) -> str:
        """URL превью лучшего элемента."""
        if obj.headliner:
            return obj.headliner.thumbnail_url or obj.headliner.file_url
        return ''

    def get_headliner_type(self, obj: Scene) -> str:
        """Тип лучшего элемента (IMAGE/VIDEO) — нужен фронту для hover-проигрывания."""
        if obj.headliner:
            return obj.headliner.element_type
        return ''
    
    def get_status_display(self, obj: Scene) -> str:
        """Получение читаемого статуса."""
        return obj.get_status_display()


class ReorderSerializer(serializers.Serializer):
    """Сериализатор для изменения порядка сцен."""
    scene_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text='Список ID сцен в новом порядке'
    )
