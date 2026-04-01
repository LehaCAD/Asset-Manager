from rest_framework import serializers
from .models import SharedLink, Comment


class CommentSerializer(serializers.ModelSerializer):
    replies = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = [
            'id', 'scene', 'element', 'parent',
            'author_name', 'author_user', 'session_id',
            'text', 'is_read', 'created_at', 'replies',
        ]
        read_only_fields = ['id', 'created_at', 'is_read', 'replies']

    def get_replies(self, obj):
        if obj.replies.exists():
            return CommentSerializer(obj.replies.all(), many=True).data
        return []


class CreateCommentAuthSerializer(serializers.Serializer):
    """Creator commenting from workspace (authenticated)."""
    text = serializers.CharField(max_length=2000)
    parent_id = serializers.IntegerField(required=False, allow_null=True)


class CreateCommentPublicSerializer(serializers.Serializer):
    """Reviewer commenting through shared link (anonymous)."""
    text = serializers.CharField(max_length=2000)
    author_name = serializers.CharField(max_length=100)
    session_id = serializers.CharField(max_length=36)
    element_id = serializers.IntegerField(required=False, allow_null=True)
    scene_id = serializers.IntegerField(required=False, allow_null=True)
    parent_id = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, data):
        has_element = data.get('element_id') is not None
        has_scene = data.get('scene_id') is not None
        if has_element == has_scene:
            raise serializers.ValidationError(
                'Exactly one of element_id or scene_id is required.'
            )
        return data


class SharedLinkSerializer(serializers.ModelSerializer):
    element_ids = serializers.PrimaryKeyRelatedField(
        source='elements', many=True, write_only=True,
        queryset=[]  # overridden in __init__ for authenticated users
    )
    element_count = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()
    url = serializers.SerializerMethodField()

    class Meta:
        model = SharedLink
        fields = [
            'id', 'token', 'project', 'name',
            'element_ids', 'element_count', 'comment_count',
            'expires_at', 'created_at', 'url', 'display_preferences',
        ]
        read_only_fields = ['id', 'token', 'created_at', 'url']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from apps.elements.models import Element
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            self.fields['element_ids'].child_relation.queryset = (
                Element.objects.filter(project__user=request.user)
            )

    def get_element_count(self, obj):
        return obj.elements.count()

    def get_comment_count(self, obj):
        element_ids = obj.elements.values_list('id', flat=True)
        return Comment.objects.filter(element_id__in=element_ids).count()

    def get_url(self, obj):
        return f"/share/{obj.token}"


class PublicElementSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    element_type = serializers.CharField()
    file_url = serializers.CharField()
    thumbnail_url = serializers.CharField()
    comment_count = serializers.IntegerField()


class PublicSceneSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    order_index = serializers.IntegerField()
    elements = PublicElementSerializer(many=True)
    comments = CommentSerializer(many=True)


class PublicProjectSerializer(serializers.Serializer):
    name = serializers.CharField()
    scenes = PublicSceneSerializer(many=True)
    ungrouped_elements = PublicElementSerializer(many=True)
