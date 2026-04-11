from rest_framework import serializers
from apps.common.s3 import get_s3_client, get_bucket_name
from .models import Conversation, Message, Attachment, FeedbackReward


def _presigned_get_url(file_key: str) -> str:
    """Generate a presigned GET URL for an attachment."""
    if not file_key:
        return ""
    return get_s3_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": get_bucket_name(), "Key": file_key},
        ExpiresIn=3600,
    )


class AttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = ["id", "file_name", "file_size", "content_type", "url", "is_expired", "created_at"]

    def get_url(self, obj):
        if obj.is_expired:
            return None
        return _presigned_get_url(obj.file_key)


class MessageSerializer(serializers.ModelSerializer):
    attachments = AttachmentSerializer(many=True, read_only=True)
    sender_name = serializers.CharField(source="sender.username", read_only=True)

    class Meta:
        model = Message
        fields = ["id", "sender_name", "is_admin", "text", "attachments", "edited_at", "created_at"]


class ConversationSerializer(serializers.ModelSerializer):
    last_message_preview = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id", "status", "tag", "created_at", "updated_at",
            "user_last_read_at",
            "last_message_preview", "unread_count",
        ]

    def get_last_message_preview(self, obj):
        msg = obj.messages.order_by("-created_at").first()
        if not msg:
            return None
        return {"text": msg.text[:100], "is_admin": msg.is_admin, "created_at": msg.created_at.isoformat()}

    def get_unread_count(self, obj):
        if not obj.user_last_read_at:
            return obj.messages.filter(is_admin=True).count()
        return obj.messages.filter(is_admin=True, created_at__gt=obj.user_last_read_at).count()


class SendMessageSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=5000, allow_blank=True)


class PresignRequestSerializer(serializers.Serializer):
    file_name = serializers.CharField(max_length=255)
    content_type = serializers.ChoiceField(choices=[
        "image/jpeg", "image/png", "image/webp", "application/pdf",
    ])


class ConfirmAttachSerializer(serializers.Serializer):
    file_key = serializers.CharField(max_length=500)
    file_name = serializers.CharField(max_length=255)
    file_size = serializers.IntegerField(min_value=1, max_value=10 * 1024 * 1024)
    content_type = serializers.ChoiceField(choices=[
        "image/jpeg", "image/png", "image/webp", "application/pdf",
    ])


# --- Admin serializers ---

class AdminConversationUserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    email = serializers.EmailField()
    date_joined = serializers.DateTimeField()
    balance = serializers.DecimalField(max_digits=12, decimal_places=2)


class AdminConversationListSerializer(serializers.ModelSerializer):
    user = AdminConversationUserSerializer(read_only=True)
    last_message_preview = serializers.SerializerMethodField()
    unread_by_admin = serializers.IntegerField(source='unread_count', read_only=True)
    rewards_total = serializers.DecimalField(
        source='total_rewards', max_digits=10, decimal_places=2, read_only=True
    )

    class Meta:
        model = Conversation
        fields = [
            "id", "user", "status", "tag", "created_at", "updated_at",
            "last_message_preview", "unread_by_admin", "rewards_total",
        ]

    def get_last_message_preview(self, obj):
        # Use annotated fields from the view queryset — no extra queries
        if obj.last_msg_created_at is None:
            return None
        return {
            "text": (obj.last_msg_text or "")[:100],
            "is_admin": bool(obj.last_msg_is_admin),
            "created_at": obj.last_msg_created_at.isoformat(),
        }


class AdminConversationUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=Conversation.STATUS_CHOICES, required=False
    )
    tag = serializers.ChoiceField(
        choices=Conversation.TAG_CHOICES, required=False, allow_blank=True
    )


class RewardSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=1)
    comment = serializers.CharField(max_length=200, required=False, default="")
