# backend/apps/feedback/views.py
import logging
import uuid

from django.conf import settings

logger = logging.getLogger(__name__)
from django.db import models
from django.db.models import Q, F, Subquery, OuterRef, Count, Sum
from django.db.models.functions import Coalesce
from datetime import timedelta
from django.utils import timezone
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response

from .models import Conversation, Message, Attachment, FeedbackReward
from .serializers import (
    ConversationSerializer,
    MessageSerializer,
    SendMessageSerializer,
    PresignRequestSerializer,
    ConfirmAttachSerializer,
    AdminConversationListSerializer,
    AdminConversationUpdateSerializer,
    RewardSerializer,
)
from apps.common.s3 import get_s3_client, get_bucket_name
from .services import grant_reward, notify_new_message, notify_conversation_updated


# ─── User endpoints ───────────────────────────────────────

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
MAX_ATTACHMENTS_PER_MESSAGE = 5


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def conversation_view(request):
    """GET: получить активный диалог. POST: создать новый (если нет открытого)."""
    if request.method == "GET":
        # Return the latest open conversation, or fallback to latest closed
        conv = Conversation.objects.filter(
            user=request.user, status=Conversation.STATUS_OPEN
        ).order_by('-updated_at').first()
        if not conv:
            conv = Conversation.objects.filter(user=request.user).order_by('-updated_at').first()
        if not conv:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(ConversationSerializer(conv).data)

    # POST — create new conversation (only if no open one exists)
    existing_open = Conversation.objects.filter(
        user=request.user, status=Conversation.STATUS_OPEN
    ).first()
    if existing_open:
        return Response(ConversationSerializer(existing_open).data, status=status.HTTP_200_OK)
    conv = Conversation.objects.create(user=request.user)
    return Response(ConversationSerializer(conv).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def messages_view(request):
    """GET: список сообщений. POST: отправить сообщение."""
    # Find open conversation, or fall through to create new / show closed
    conv = Conversation.objects.filter(
        user=request.user, status=Conversation.STATUS_OPEN
    ).order_by('-updated_at').first()

    if request.method == "GET":
        if not conv:
            # Fallback: show latest closed conversation messages (read-only history)
            conv = Conversation.objects.filter(user=request.user).order_by('-updated_at').first()
        if not conv:
            return Response([])
        cursor = request.query_params.get("cursor")
        qs = conv.messages.filter(is_deleted=False).select_related("sender").prefetch_related("attachments")
        if cursor:
            qs = qs.filter(id__lt=int(cursor))
        messages = qs.order_by("-created_at")[:30]
        return Response(MessageSerializer(reversed(list(messages)), many=True).data)

    ser = SendMessageSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    if not conv:
        # All conversations are closed or none exist — create new one
        conv = Conversation.objects.create(user=request.user)

    # Пустой text допустим: фронтенд создаёт сообщение с пустым текстом,
    # а затем отдельным запросом прикрепляет файлы (confirm-attach).
    # Не валидируем text на непустоту — это ломает attachment-only messages.
    msg = Message.objects.create(
        conversation=conv,
        sender=request.user,
        is_admin=False,
        text=ser.validated_data["text"],
    )
    conv.save(update_fields=["updated_at"])  # touch updated_at
    notify_new_message(conv, msg)

    # Onboarding: first user-authored support message
    try:
        from apps.onboarding.services import OnboardingService
        OnboardingService().try_complete(request.user, "feedback.first_message")
    except Exception:
        logger.exception(
            "onboarding trigger failed for feedback.first_message",
            extra={"user_id": request.user.id, "conversation_id": conv.id},
        )

    return Response(MessageSerializer(msg).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def presign_view(request, message_id):
    """Получить presigned PUT URL для загрузки в S3."""
    if request.user.is_staff:
        msg = Message.objects.filter(id=message_id).first()
    else:
        msg = Message.objects.filter(
            id=message_id, conversation__user=request.user, is_admin=False,
        ).first()
    if not msg:
        return Response({"detail": "Сообщение не найдено"}, status=status.HTTP_404_NOT_FOUND)

    if msg.attachments.count() >= MAX_ATTACHMENTS_PER_MESSAGE:
        return Response(
            {"detail": f"Максимум {MAX_ATTACHMENTS_PER_MESSAGE} вложений на сообщение"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ser = PresignRequestSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    content_type = ser.validated_data["content_type"]
    ext_map = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf"}
    ext = ext_map.get(content_type, ".bin")
    file_key = f"feedback/tmp/{uuid.uuid4()}{ext}"

    client = get_s3_client()
    presigned_url = client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": get_bucket_name(),
            "Key": file_key,
            "ContentType": content_type,
        },
        ExpiresIn=900,
    )

    return Response({
        "upload_url": presigned_url,
        "file_key": file_key,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def confirm_attach_view(request, message_id):
    """Подтвердить загрузку, запустить resize в Celery."""
    if request.user.is_staff:
        msg = Message.objects.filter(id=message_id).select_related("conversation").first()
    else:
        msg = Message.objects.filter(
            id=message_id, conversation__user=request.user, is_admin=False,
        ).select_related("conversation").first()
    if not msg:
        return Response({"detail": "Сообщение не найдено"}, status=status.HTTP_404_NOT_FOUND)

    ser = ConfirmAttachSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    file_key = ser.validated_data["file_key"]
    if not file_key.startswith("feedback/tmp/"):
        return Response({"detail": "Некорректный ключ"}, status=status.HTTP_400_BAD_REQUEST)

    from .tasks import process_feedback_attachment
    process_feedback_attachment.delay(
        conversation_id=msg.conversation.id,
        message_id=msg.id,
        tmp_file_key=file_key,
        file_name=ser.validated_data["file_name"],
        content_type=ser.validated_data.get("content_type", "image/jpeg"),
    )
    return Response({"status": "processing"}, status=status.HTTP_202_ACCEPTED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def all_messages_view(request):
    """Get all messages across all user's conversations (unified stream)."""
    convs = Conversation.objects.filter(user=request.user).order_by('created_at')
    if not convs.exists():
        return Response([])

    cursor = request.query_params.get("cursor")
    qs = Message.objects.filter(
        conversation__user=request.user, is_deleted=False
    ).select_related("sender").prefetch_related("attachments").order_by("-created_at")

    if cursor:
        qs = qs.filter(id__lt=int(cursor))

    messages = list(qs[:30])
    messages.reverse()

    # Use MessageSerializer but add conversation_id
    data = []
    for msg in messages:
        msg_data = MessageSerializer(msg).data
        msg_data['conversation_id'] = msg.conversation_id
        data.append(msg_data)

    return Response(data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_read_view(request):
    """Обновить user_last_read_at."""
    conv = Conversation.objects.filter(
        user=request.user, status=Conversation.STATUS_OPEN
    ).order_by('-updated_at').first()
    if not conv:
        conv = Conversation.objects.filter(user=request.user).order_by('-updated_at').first()
    if conv:
        conv.user_last_read_at = timezone.now()
        conv.save(update_fields=["user_last_read_at"])
    return Response({"status": "ok"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def conversation_history_view(request):
    """List all conversations for the current user (for history browsing)."""
    convs = Conversation.objects.filter(user=request.user).order_by('-updated_at')
    return Response(ConversationSerializer(convs, many=True).data)


# ─── Admin endpoints ──────────────────────────────────────

from rest_framework_simplejwt.authentication import JWTAuthentication

ADMIN_AUTH = [SessionAuthentication, JWTAuthentication]


def _annotated_conversations_qs():
    """Queryset with annotations for AdminConversationListSerializer.

    Replaces prefetch_related('messages', 'rewards') with DB-level aggregation,
    reducing ~3N+1 queries to ~4 subqueries regardless of conversation count.
    """
    last_msg_sub = Message.objects.filter(
        conversation=OuterRef('pk'), is_deleted=False
    ).order_by('-created_at')

    return Conversation.objects.select_related("user").annotate(
        last_msg_text=Subquery(last_msg_sub.values('text')[:1]),
        last_msg_is_admin=Subquery(last_msg_sub.values('is_admin')[:1]),
        last_msg_created_at=Subquery(last_msg_sub.values('created_at')[:1]),
        unread_count=Count(
            'messages',
            filter=Q(
                messages__is_admin=False,
                messages__is_deleted=False,
            ) & (
                Q(admin_last_read_at__isnull=True)
                | Q(messages__created_at__gt=F('admin_last_read_at'))
            )
        ),
        total_rewards=Coalesce(
            Subquery(
                FeedbackReward.objects.filter(conversation=OuterRef('pk'))
                .values('conversation')
                .annotate(total=Sum('amount'))
                .values('total')[:1]
            ),
            0,
            output_field=models.DecimalField()
        ),
    )


@api_view(["GET"])
@authentication_classes(ADMIN_AUTH)
@permission_classes([IsAdminUser])
def admin_conversations_list(request):
    """Список всех диалогов с фильтрами — оптимизированный."""
    qs = _annotated_conversations_qs()

    status_filter = request.query_params.get("status")
    if status_filter:
        qs = qs.filter(status=status_filter)

    tag_filter = request.query_params.get("tag")
    if tag_filter:
        qs = qs.filter(tag=tag_filter)

    search = request.query_params.get("search")
    if search:
        qs = qs.filter(
            Q(user__username__icontains=search)
            | Q(user__email__icontains=search)
        )

    return Response(AdminConversationListSerializer(qs[:500], many=True).data)


@api_view(["GET", "PATCH"])
@authentication_classes(ADMIN_AUTH)
@permission_classes([IsAdminUser])
def admin_conversation_detail(request, conversation_id):
    """GET: детали диалога. PATCH: обновить status/tag."""
    qs = _annotated_conversations_qs()

    try:
        conv = qs.get(id=conversation_id)
    except Conversation.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(AdminConversationListSerializer(conv).data)

    ser = AdminConversationUpdateSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    for field, value in ser.validated_data.items():
        setattr(conv, field, value)
    conv.save(update_fields=list(ser.validated_data.keys()))

    notify_conversation_updated(conv)
    # Re-fetch with annotations after update
    conv = qs.get(id=conversation_id)
    return Response(AdminConversationListSerializer(conv).data)


@api_view(["GET", "POST"])
@authentication_classes(ADMIN_AUTH)
@permission_classes([IsAdminUser])
def admin_conversation_messages(request, conversation_id):
    """GET: сообщения диалога. POST: ответ админа."""
    try:
        conv = Conversation.objects.get(id=conversation_id)
    except Conversation.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        cursor = request.query_params.get("cursor")
        qs = conv.messages.filter(is_deleted=False).select_related("sender").prefetch_related("attachments")
        if cursor:
            qs = qs.filter(id__lt=int(cursor))
        messages = qs.order_by("-created_at")[:30]
        return Response(MessageSerializer(reversed(list(messages)), many=True).data)

    ser = SendMessageSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    msg = Message.objects.create(
        conversation=conv,
        sender=request.user,
        is_admin=True,
        text=ser.validated_data["text"],
    )
    conv.save(update_fields=["updated_at"])
    notify_new_message(conv, msg)
    return Response(MessageSerializer(msg).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@authentication_classes(ADMIN_AUTH)
@permission_classes([IsAdminUser])
def admin_reward_view(request, conversation_id):
    """Начислить Кадры юзеру."""
    try:
        conv = Conversation.objects.select_related("user").get(id=conversation_id)
    except Conversation.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    ser = RewardSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    reward = grant_reward(
        conversation=conv,
        amount=ser.validated_data["amount"],
        comment=ser.validated_data["comment"],
        granted_by=request.user,
    )
    return Response({
        "id": reward.id,
        "amount": str(reward.amount),
        "comment": reward.comment,
    }, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@authentication_classes(ADMIN_AUTH)
@permission_classes([IsAdminUser])
def admin_mark_read_view(request, conversation_id):
    """Обновить admin_last_read_at."""
    Conversation.objects.filter(id=conversation_id).update(
        admin_last_read_at=timezone.now()
    )
    return Response({"status": "ok"})


@api_view(["GET"])
@authentication_classes(ADMIN_AUTH)
@permission_classes([IsAdminUser])
def admin_unread_total(request):
    """Суммарное количество непрочитанных обращений."""
    total = Conversation.objects.filter(
        models.Q(admin_last_read_at__isnull=True, messages__is_admin=False)
        | models.Q(messages__is_admin=False, messages__created_at__gt=models.F("admin_last_read_at"))
    ).distinct().count()
    return Response({"unread_total": total})


@api_view(["POST"])
@authentication_classes(ADMIN_AUTH)
@permission_classes([IsAdminUser])
def admin_clear_history(request, conversation_id):
    """Clear all messages and attachments from a conversation."""
    try:
        conv = Conversation.objects.get(id=conversation_id)
    except Conversation.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    # Delete S3 files
    client = get_s3_client()
    bucket = get_bucket_name()
    for att in Attachment.objects.filter(message__conversation=conv, file_key__gt=''):
        try:
            client.delete_object(Bucket=bucket, Key=att.file_key)
        except Exception:
            logger.exception(
                "S3 delete failed during clear_history",
                extra={"conversation_id": conv.id, "file_key": att.file_key},
            )

    # Delete all messages (cascades to attachments)
    conv.messages.all().delete()

    # Notify via WS
    from .services import _send_to_conversation
    _send_to_conversation(conv.id, {"type": "conversation_updated", "status": conv.status, "tag": conv.tag})

    return Response({"status": "cleared", "conversation_id": conversation_id})


@api_view(["DELETE"])
@authentication_classes(ADMIN_AUTH)
@permission_classes([IsAdminUser])
def admin_delete_conversation(request, conversation_id):
    """Delete entire conversation with all messages and S3 files."""
    try:
        conv = Conversation.objects.get(id=conversation_id)
    except Conversation.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    # Delete S3 files
    client = get_s3_client()
    bucket = get_bucket_name()
    for att in Attachment.objects.filter(message__conversation=conv, file_key__gt=''):
        try:
            client.delete_object(Bucket=bucket, Key=att.file_key)
        except Exception:
            logger.exception(
                "S3 delete failed during delete_conversation",
                extra={"conversation_id": conv.id, "file_key": att.file_key},
            )

    conv.delete()  # Cascades to messages, attachments, rewards

    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@authentication_classes(ADMIN_AUTH)
@permission_classes([IsAdminUser])
def admin_clear_attachments(request, conversation_id):
    """Delete all attachment files from S3, mark as expired."""
    try:
        conv = Conversation.objects.get(id=conversation_id)
    except Conversation.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    client = get_s3_client()
    bucket = get_bucket_name()

    atts = Attachment.objects.filter(message__conversation=conv, is_expired=False)
    count = 0
    for att in atts:
        if att.file_key:
            try:
                client.delete_object(Bucket=bucket, Key=att.file_key)
            except Exception:
                logger.exception(
                    "S3 delete failed during clear_attachments",
                    extra={"conversation_id": conv.id, "file_key": att.file_key},
                )
        att.file_key = ''
        att.is_expired = True
        att.save(update_fields=['file_key', 'is_expired'])
        count += 1

    return Response({"status": "cleared", "attachments_removed": count})


@api_view(["GET"])
@authentication_classes(ADMIN_AUTH)
@permission_classes([IsAdminUser])
def admin_conversation_stats(request, conversation_id):
    """Get conversation statistics: message count, attachment count, storage size."""
    try:
        conv = Conversation.objects.get(id=conversation_id)
    except Conversation.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    msg_count = conv.messages.filter(is_deleted=False).count()
    atts = Attachment.objects.filter(message__conversation=conv, is_expired=False)
    att_count = atts.count()
    storage_bytes = sum(a.file_size for a in atts if a.file_size)

    return Response({
        "messages": msg_count,
        "attachments": att_count,
        "storage_bytes": storage_bytes,
    })


@api_view(["POST"])
@authentication_classes(ADMIN_AUTH)
@permission_classes([IsAdminUser])
def admin_bulk_action(request):
    """Bulk actions on conversations."""
    action = request.data.get("action")

    if action == "close_old_inactive":
        days = int(request.data.get("days", 30))
        cutoff = timezone.now() - timedelta(days=days)
        qs = Conversation.objects.filter(status="closed", updated_at__lt=cutoff)
        count = qs.count()
        qs.delete()  # Cascade deletes messages + attachments (S3 files stay — use cleanup task)
        return Response({"action": action, "deleted": count})

    if action == "close_all_open":
        count = Conversation.objects.filter(status="open").update(status="closed")
        return Response({"action": action, "closed": count})

    return Response({"detail": "Unknown action"}, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
@authentication_classes(ADMIN_AUTH)
@permission_classes([IsAdminUser])
def admin_merge_conversations(request):
    """Merge source conversation into target conversation."""
    source_id = request.data.get("source_id")
    target_id = request.data.get("target_id")

    if not source_id or not target_id or source_id == target_id:
        return Response(
            {"detail": "Укажите source_id и target_id"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        source = Conversation.objects.get(id=source_id)
        target = Conversation.objects.get(id=target_id)
    except Conversation.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    # Verify same user
    if source.user_id != target.user_id:
        return Response(
            {"detail": "Диалоги принадлежат разным пользователям"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Move all messages from source to target
    Message.objects.filter(conversation=source).update(conversation=target)

    # Move rewards
    FeedbackReward.objects.filter(conversation=source).update(conversation=target)

    # Reopen target if it was closed
    if target.status != Conversation.STATUS_OPEN:
        target.status = Conversation.STATUS_OPEN
    target.save(update_fields=["status", "updated_at"])

    # Delete empty source
    source.delete()

    return Response({"status": "merged", "target_id": target_id})


@api_view(["PATCH", "DELETE"])
@authentication_classes(ADMIN_AUTH)
@permission_classes([IsAdminUser])
def admin_message_actions(request, message_id):
    """PATCH: edit admin message. DELETE: soft-delete any message (moderation)."""
    from .services import _send_to_conversation

    if request.method == "PATCH":
        msg = Message.objects.filter(id=message_id, is_admin=True, is_deleted=False).first()
        if not msg:
            return Response({"detail": "Сообщение не найдено"}, status=status.HTTP_404_NOT_FOUND)

        text = request.data.get("text", "").strip()
        if not text:
            return Response({"detail": "Текст не может быть пустым"}, status=status.HTTP_400_BAD_REQUEST)

        msg.text = text
        msg.edited_at = timezone.now()
        msg.save(update_fields=["text", "edited_at"])

        _send_to_conversation(msg.conversation_id, {
            "type": "message_edited",
            "message": MessageSerializer(msg).data,
        })
        return Response(MessageSerializer(msg).data)

    # DELETE — soft delete
    msg = Message.objects.filter(id=message_id, is_deleted=False).first()
    if not msg:
        return Response(status=status.HTTP_404_NOT_FOUND)

    conversation_id = msg.conversation_id
    msg.is_deleted = True
    msg.text = ""
    msg.save(update_fields=["is_deleted", "text"])

    # Delete attachments from S3
    for att in msg.attachments.all():
        if att.file_key:
            try:
                client = get_s3_client()
                client.delete_object(Bucket=get_bucket_name(), Key=att.file_key)
            except Exception:
                logger.exception(
                    "S3 delete failed during message delete",
                    extra={"message_id": message_id, "file_key": att.file_key},
                )
            att.file_key = ""
            att.is_expired = True
            att.save(update_fields=["file_key", "is_expired"])

    _send_to_conversation(conversation_id, {
        "type": "message_deleted",
        "message_id": message_id,
    })
    return Response(status=status.HTTP_204_NO_CONTENT)
