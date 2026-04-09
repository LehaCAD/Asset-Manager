# backend/apps/feedback/views.py
import uuid

import boto3
from django.conf import settings
from django.db import models
from django.utils import timezone
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response

from .models import Conversation, Message, Attachment
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
from .services import grant_reward, notify_new_message, notify_conversation_updated


# ─── User endpoints ───────────────────────────────────────

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
MAX_ATTACHMENTS_PER_MESSAGE = 5


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def conversation_view(request):
    """GET: получить свой диалог. POST: создать если нет."""
    if request.method == "GET":
        try:
            conv = Conversation.objects.get(user=request.user)
        except Conversation.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(ConversationSerializer(conv).data)

    conv, _ = Conversation.objects.get_or_create(user=request.user)
    return Response(ConversationSerializer(conv).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def messages_view(request):
    """GET: список сообщений. POST: отправить сообщение."""
    conv = Conversation.objects.filter(user=request.user).first()

    if request.method == "GET":
        if not conv:
            return Response([])
        cursor = request.query_params.get("cursor")
        qs = conv.messages.select_related("sender").prefetch_related("attachments")
        if cursor:
            qs = qs.filter(id__lt=int(cursor))
        messages = qs.order_by("-created_at")[:50]
        return Response(MessageSerializer(reversed(list(messages)), many=True).data)

    ser = SendMessageSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    if not conv:
        conv = Conversation.objects.create(user=request.user)

    # Reopen if resolved
    if conv.status == Conversation.STATUS_RESOLVED:
        conv.status = Conversation.STATUS_OPEN
        conv.save(update_fields=["status"])

    msg = Message.objects.create(
        conversation=conv,
        sender=request.user,
        is_admin=False,
        text=ser.validated_data["text"],
    )
    conv.save(update_fields=["updated_at"])  # touch updated_at
    notify_new_message(conv, msg)
    return Response(MessageSerializer(msg).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def presign_view(request, message_id):
    """Получить presigned PUT URL для загрузки в S3."""
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

    client = boto3.client(
        "s3",
        endpoint_url=settings.AWS_S3_ENDPOINT_URL,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_S3_REGION_NAME,
    )
    presigned_url = client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.AWS_STORAGE_BUCKET_NAME,
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


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_read_view(request):
    """Обновить user_last_read_at."""
    conv = Conversation.objects.filter(user=request.user).first()
    if conv:
        conv.user_last_read_at = timezone.now()
        conv.save(update_fields=["user_last_read_at"])
    return Response({"status": "ok"})


# ─── Admin endpoints ──────────────────────────────────────

from rest_framework_simplejwt.authentication import JWTAuthentication

ADMIN_AUTH = [SessionAuthentication, JWTAuthentication]


@api_view(["GET"])
@authentication_classes(ADMIN_AUTH)
@permission_classes([IsAdminUser])
def admin_conversations_list(request):
    """Список всех диалогов с фильтрами."""
    qs = Conversation.objects.select_related("user").prefetch_related("messages", "rewards")

    status_filter = request.query_params.get("status")
    if status_filter:
        qs = qs.filter(status=status_filter)

    tag_filter = request.query_params.get("tag")
    if tag_filter:
        qs = qs.filter(tag=tag_filter)

    search = request.query_params.get("search")
    if search:
        qs = qs.filter(
            models.Q(user__username__icontains=search)
            | models.Q(user__email__icontains=search)
        )

    return Response(AdminConversationListSerializer(qs[:100], many=True).data)


@api_view(["GET", "PATCH"])
@authentication_classes(ADMIN_AUTH)
@permission_classes([IsAdminUser])
def admin_conversation_detail(request, conversation_id):
    """GET: детали диалога. PATCH: обновить status/tag."""
    try:
        conv = Conversation.objects.select_related("user").get(id=conversation_id)
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
        qs = conv.messages.select_related("sender").prefetch_related("attachments")
        if cursor:
            qs = qs.filter(id__lt=int(cursor))
        messages = qs.order_by("-created_at")[:50]
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


@api_view(["DELETE"])
@authentication_classes(ADMIN_AUTH)
@permission_classes([IsAdminUser])
def admin_delete_message(request, message_id):
    """Удалить сообщение (модерация)."""
    deleted, _ = Message.objects.filter(id=message_id).delete()
    if not deleted:
        return Response(status=status.HTTP_404_NOT_FOUND)
    return Response(status=status.HTTP_204_NO_CONTENT)
