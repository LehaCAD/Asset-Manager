# Feedback Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated feedback chat module — users report bugs/ideas via navbar dropdown or cabinet page, admin manages conversations in a Telegram-style inbox, rewards users with Кадры.

**Architecture:** New Django app `apps.feedback` with models, DRF views, Channels consumer, Celery tasks. Frontend: Zustand stores, API client, WS manager, React components. Presigned S3 uploads for attachments (no server-side staging). Images auto-resized to 800px, originals discarded. 90-day auto-cleanup.

**Tech Stack:** Django 5, DRF, Channels, Celery, boto3 (S3 presigned), Pillow (resize), python-magic (MIME validation), Next.js 14, React 19, Zustand 5, shadcn/ui, Tailwind 4

**Spec:** `docs/superpowers/specs/2026-04-09-feedback-chat-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/apps/feedback/__init__.py` | Create | App init |
| `backend/apps/feedback/apps.py` | Create | App config |
| `backend/apps/feedback/models.py` | Create | Conversation, Message, Attachment, FeedbackReward |
| `backend/apps/feedback/admin.py` | Create | Django admin registration |
| `backend/apps/feedback/serializers.py` | Create | All serializers (user + admin) |
| `backend/apps/feedback/views.py` | Create | User + Admin DRF views |
| `backend/apps/feedback/urls.py` | Create | URL patterns |
| `backend/apps/feedback/consumers.py` | Create | FeedbackChatConsumer |
| `backend/apps/feedback/routing.py` | Create | WebSocket URL patterns |
| `backend/apps/feedback/services.py` | Create | grant_reward(), notify functions |
| `backend/apps/feedback/tasks.py` | Create | Celery: process_attachment, cleanup_tmp, cleanup_old |
| `backend/apps/feedback/tests.py` | Create | All backend tests |
| `backend/apps/credits/models.py` | Modify | Add REASON_FEEDBACK_REWARD constant + choice |
| `backend/apps/notifications/models.py` | Modify | Add feedback notification types |
| `backend/config/settings.py` | Modify | INSTALLED_APPS + CELERY_BEAT_SCHEDULE |
| `backend/config/urls.py` | Modify | Add feedback URLs |
| `backend/config/asgi.py` | Modify | Merge feedback WS routes |
| `backend/requirements.txt` | Modify | Add python-magic |
| `frontend/lib/types/index.ts` | Modify | Add Feedback types |
| `frontend/lib/api/feedback.ts` | Create | API client |
| `frontend/lib/api/feedback-ws.ts` | Create | WebSocket manager |
| `frontend/lib/store/feedback.ts` | Create | User feedback store |
| `frontend/lib/store/feedback-admin.ts` | Create | Admin feedback store |
| `frontend/components/feedback/FeedbackButton.tsx` | Create | Navbar pill |
| `frontend/components/feedback/FeedbackDropdown.tsx` | Create | Quick message popover |
| `frontend/components/feedback/FeedbackChat.tsx` | Create | Full chat (cabinet) |
| `frontend/components/feedback/MessageBubble.tsx` | Create | Shared message component |
| `frontend/components/feedback/AttachmentPreview.tsx` | Create | Attachment display |
| `frontend/components/feedback/SystemMessage.tsx` | Create | System messages (reward, status) |
| `frontend/components/feedback/AdminFeedbackInbox.tsx` | Create | Telegram-style admin |
| `frontend/components/feedback/ConversationList.tsx` | Create | Admin sidebar list |
| `frontend/components/feedback/AdminChatPanel.tsx` | Create | Admin chat area |
| `frontend/components/feedback/RewardModal.tsx` | Create | Reward dialog |
| `frontend/app/(cabinet)/cabinet/feedback/page.tsx` | Create | User feedback page |
| `frontend/app/(workspace)/admin/feedback/page.tsx` | Create | Admin feedback page |
| `frontend/components/layout/Navbar.tsx` | Modify | Add FeedbackButton |
| `frontend/app/(cabinet)/cabinet/layout.tsx` | Modify | Add sidebar item |

---

### Task 1: Backend — Django app scaffold + models + migration

**Files:**
- Create: `backend/apps/feedback/__init__.py`, `apps.py`, `models.py`, `admin.py`
- Modify: `backend/config/settings.py` (INSTALLED_APPS)
- Modify: `backend/requirements.txt` (python-magic)

- [ ] **Step 1: Create app directory and files**

```bash
mkdir -p backend/apps/feedback
touch backend/apps/feedback/__init__.py
```

- [ ] **Step 2: Write apps.py**

```python
# backend/apps/feedback/apps.py
from django.apps import AppConfig

class FeedbackConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.feedback"
    verbose_name = "Обратная связь"
```

- [ ] **Step 3: Write models.py**

```python
# backend/apps/feedback/models.py
from django.db import models
from django.conf import settings


class Conversation(models.Model):
    """Один юзер = один диалог (в MVP)."""

    STATUS_OPEN = "open"
    STATUS_RESOLVED = "resolved"
    STATUS_CHOICES = [
        (STATUS_OPEN, "Открыт"),
        (STATUS_RESOLVED, "Решён"),
    ]

    TAG_BUG = "bug"
    TAG_QUESTION = "question"
    TAG_IDEA = "idea"
    TAG_CHOICES = [
        (TAG_BUG, "Баг"),
        (TAG_QUESTION, "Вопрос"),
        (TAG_IDEA, "Идея"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="feedback_conversation",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN)
    tag = models.CharField(max_length=20, choices=TAG_CHOICES, blank=True)
    user_last_read_at = models.DateTimeField(null=True, blank=True)
    admin_last_read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"Feedback: {self.user.username} ({self.status})"


class Message(models.Model):
    """Сообщение в диалоге."""

    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE
    )
    is_admin = models.BooleanField(default=False)
    text = models.TextField(max_length=5000, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        role = "admin" if self.is_admin else "user"
        return f"[{role}] {self.text[:50]}"


class Attachment(models.Model):
    """Вложение к сообщению. Изображения — 800px, без оригиналов."""

    message = models.ForeignKey(
        Message, on_delete=models.CASCADE, related_name="attachments"
    )
    file_key = models.CharField(max_length=500)
    file_name = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField()
    content_type = models.CharField(max_length=100)
    is_expired = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.file_name


class FeedbackReward(models.Model):
    """Награда за обратную связь."""

    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="rewards"
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    comment = models.CharField(max_length=200, blank=True)
    transaction = models.ForeignKey(
        "credits.CreditsTransaction",
        on_delete=models.SET_NULL,
        null=True,
    )
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.amount} Кадров → {self.conversation.user.username}"
```

- [ ] **Step 4: Write admin.py**

```python
# backend/apps/feedback/admin.py
from django.contrib import admin
from .models import Conversation, Message, Attachment, FeedbackReward


class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    readonly_fields = ("sender", "is_admin", "text", "created_at")


class RewardInline(admin.TabularInline):
    model = FeedbackReward
    extra = 0
    readonly_fields = ("amount", "comment", "granted_by", "created_at")


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("user", "status", "tag", "updated_at")
    list_filter = ("status", "tag")
    search_fields = ("user__username", "user__email")
    inlines = [MessageInline, RewardInline]


@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ("file_name", "content_type", "file_size", "is_expired", "created_at")
    list_filter = ("is_expired", "content_type")
```

- [ ] **Step 5: Add python-magic to requirements.txt + libmagic to Dockerfile**

Add to `backend/requirements.txt`:
```
python-magic==0.4.27
```

In `backend/Dockerfile`, add to the `apt-get install` line (or add one if missing):
```dockerfile
RUN apt-get update && apt-get install -y libmagic1 && rm -rf /var/lib/apt/lists/*
```

- [ ] **Step 6: Add to INSTALLED_APPS in settings.py**

In `backend/config/settings.py`, add `"apps.feedback"` to `INSTALLED_APPS` list.

- [ ] **Step 7: Create and run migration**

```bash
docker compose exec backend python manage.py makemigrations feedback
docker compose exec backend python manage.py migrate
```

- [ ] **Step 8: Commit**

```bash
git add backend/apps/feedback/ backend/config/settings.py backend/requirements.txt
git commit -m "feat(feedback): models, migration, admin registration"
```

---

### Task 2: Backend — Credits + Notification type integration

**Files:**
- Modify: `backend/apps/credits/models.py` (add constant + choice)
- Modify: `backend/apps/notifications/models.py` (add types)

- [ ] **Step 1: Add REASON_FEEDBACK_REWARD to credits model**

In `backend/apps/credits/models.py`, after `REASON_TRIAL_BONUS = "trial_bonus"` (around line 15), add:

```python
REASON_FEEDBACK_REWARD = "feedback_reward"
```

In `REASON_CHOICES` list, add:

```python
(REASON_FEEDBACK_REWARD, "Награда за обратную связь"),
```

- [ ] **Step 2: Add feedback notification types**

In `backend/apps/notifications/models.py`, in the `Type` TextChoices class, add:

```python
FEEDBACK_NEW = 'feedback_new', 'Новое обращение'
FEEDBACK_REPLY = 'feedback_reply', 'Ответ на обращение'
FEEDBACK_REWARD = 'feedback_reward', 'Награда за обратную связь'
```

- [ ] **Step 3: Commit**

```bash
git add backend/apps/credits/models.py backend/apps/notifications/models.py
git commit -m "feat(feedback): add credits reason + notification types for feedback"
```

---

### Task 3: Backend — Services layer

**Files:**
- Create: `backend/apps/feedback/services.py`

- [ ] **Step 1: Write services.py**

```python
# backend/apps/feedback/services.py
from decimal import Decimal

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from apps.credits.services import CreditsService
from apps.credits.models import CreditsTransaction
from apps.notifications.services import create_notification
from .models import Conversation, Message, FeedbackReward

import logging

logger = logging.getLogger(__name__)


def grant_reward(
    conversation: Conversation,
    amount: Decimal,
    comment: str,
    granted_by,
) -> FeedbackReward:
    """Начислить Кадры юзеру за обратную связь."""
    # Уникальный маркер для поиска транзакции без race condition
    import uuid as _uuid
    reward_marker = str(_uuid.uuid4())

    credits_service = CreditsService()
    credits_service.topup(
        user=conversation.user,
        amount=amount,
        reason=CreditsTransaction.REASON_FEEDBACK_REWARD,
        metadata={
            "feedback_conversation_id": conversation.id,
            "comment": comment,
            "reward_marker": reward_marker,
        },
    )

    # Найти транзакцию по уникальному маркеру
    tx = CreditsTransaction.objects.filter(
        user=conversation.user,
        reason=CreditsTransaction.REASON_FEEDBACK_REWARD,
        metadata__contains={"reward_marker": reward_marker},
    ).first()

    reward = FeedbackReward.objects.create(
        conversation=conversation,
        amount=amount,
        comment=comment,
        transaction=tx,
        granted_by=granted_by,
    )

    # Системное сообщение в чат
    system_text = f"Начислено {amount} Кадров"
    if comment:
        system_text += f": {comment}"
    sys_msg = Message.objects.create(
        conversation=conversation,
        sender=granted_by,
        is_admin=True,
        text=f"⚡ {system_text}",
    )

    # WebSocket: reward_granted
    _send_to_conversation(conversation.id, {
        "type": "reward_granted",
        "amount": str(amount),
        "comment": comment,
        "message": {
            "id": sys_msg.id,
            "is_admin": True,
            "text": sys_msg.text,
            "created_at": sys_msg.created_at.isoformat(),
            "attachments": [],
        },
    })

    # Notification юзеру
    create_notification(
        user=conversation.user,
        type="feedback_reward",
        project=None,
        title="Награда за обратную связь",
        message=system_text,
    )

    return reward


def notify_new_message(conversation: Conversation, message: Message):
    """Отправить WS-событие о новом сообщении + notification."""
    _send_to_conversation(conversation.id, {
        "type": "new_message",
        "message": {
            "id": message.id,
            "sender_name": message.sender.username,
            "is_admin": message.is_admin,
            "text": message.text,
            "created_at": message.created_at.isoformat(),
            "attachments": [],
        },
    })

    # Notification: если от юзера — уведомить админов; если от админа — юзеру
    if not message.is_admin:
        # Уведомление всем staff (в MVP — один админ)
        from django.contrib.auth import get_user_model
        User = get_user_model()
        for admin in User.objects.filter(is_staff=True):
            create_notification(
                user=admin,
                type="feedback_new",
                project=None,
                title=f"Обращение от {conversation.user.username}",
                message=message.text[:100],
            )
    else:
        create_notification(
            user=conversation.user,
            type="feedback_reply",
            project=None,
            title="Ответ от команды",
            message=message.text[:100],
        )


def notify_attachment_ready(conversation_id: int, message_id: int, attachment_data: dict):
    """Отправить WS-событие что вложение обработано."""
    _send_to_conversation(conversation_id, {
        "type": "attachment_ready",
        "message_id": message_id,
        "attachment": attachment_data,
    })


def _send_to_conversation(conversation_id: int, payload: dict):
    """Отправить событие в WebSocket группу диалога."""
    channel_layer = get_channel_layer()
    try:
        async_to_sync(channel_layer.group_send)(
            f"feedback_{conversation_id}",
            payload,
        )
    except Exception:
        logger.exception("Failed to send WS event to feedback_%s", conversation_id)
```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/feedback/services.py
git commit -m "feat(feedback): services — reward granting, WS notifications"
```

---

### Task 4: Backend — Serializers

**Files:**
- Create: `backend/apps/feedback/serializers.py`

- [ ] **Step 1: Write serializers.py**

```python
# backend/apps/feedback/serializers.py
import boto3
from rest_framework import serializers
from django.conf import settings
from .models import Conversation, Message, Attachment, FeedbackReward


def _get_s3():
    return boto3.client(
        "s3",
        endpoint_url=settings.AWS_S3_ENDPOINT_URL,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_S3_REGION_NAME,
    )


def _presigned_get_url(file_key: str) -> str:
    """Generate a presigned GET URL for an attachment."""
    if not file_key:
        return ""
    return _get_s3().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.AWS_STORAGE_BUCKET_NAME, "Key": file_key},
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
        fields = ["id", "sender_name", "is_admin", "text", "attachments", "created_at"]


class ConversationSerializer(serializers.ModelSerializer):
    last_message_preview = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id", "status", "tag", "created_at", "updated_at",
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
    text = serializers.CharField(max_length=5000)


class PresignRequestSerializer(serializers.Serializer):
    file_name = serializers.CharField(max_length=255)
    content_type = serializers.ChoiceField(choices=[
        "image/jpeg", "image/png", "image/webp", "application/pdf",
    ])


class ConfirmAttachSerializer(serializers.Serializer):
    file_key = serializers.CharField(max_length=500)
    file_name = serializers.CharField(max_length=255)
    file_size = serializers.IntegerField(min_value=1, max_value=10 * 1024 * 1024)


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
    unread_by_admin = serializers.SerializerMethodField()
    rewards_total = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id", "user", "status", "tag", "created_at", "updated_at",
            "last_message_preview", "unread_by_admin", "rewards_total",
        ]

    def get_last_message_preview(self, obj):
        msg = obj.messages.order_by("-created_at").first()
        if not msg:
            return None
        return {"text": msg.text[:100], "is_admin": msg.is_admin, "created_at": msg.created_at.isoformat()}

    def get_unread_by_admin(self, obj):
        if not obj.admin_last_read_at:
            return obj.messages.filter(is_admin=False).count()
        return obj.messages.filter(is_admin=False, created_at__gt=obj.admin_last_read_at).count()

    def get_rewards_total(self, obj):
        total = sum(r.amount for r in obj.rewards.all())
        return str(total)


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
```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/feedback/serializers.py
git commit -m "feat(feedback): serializers for user + admin APIs"
```

---

### Task 5: Backend — Views (user + admin)

**Files:**
- Create: `backend/apps/feedback/views.py`
- Create: `backend/apps/feedback/urls.py`
- Modify: `backend/config/urls.py`

- [ ] **Step 1: Write views.py**

```python
# backend/apps/feedback/views.py
import uuid

import boto3
from django.conf import settings
from django.db import models
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
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
from .services import grant_reward, notify_new_message


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
        content_type=request.data.get("content_type", "image/jpeg"),
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

@api_view(["GET"])
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

    return Response(AdminConversationListSerializer(conv).data)


@api_view(["GET", "POST"])
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
@permission_classes([IsAdminUser])
def admin_mark_read_view(request, conversation_id):
    """Обновить admin_last_read_at."""
    Conversation.objects.filter(id=conversation_id).update(
        admin_last_read_at=timezone.now()
    )
    return Response({"status": "ok"})


@api_view(["DELETE"])
@permission_classes([IsAdminUser])
def admin_delete_message(request, message_id):
    """Удалить сообщение (модерация)."""
    deleted, _ = Message.objects.filter(id=message_id).delete()
    if not deleted:
        return Response(status=status.HTTP_404_NOT_FOUND)
    return Response(status=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 2: Write urls.py**

```python
# backend/apps/feedback/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # User
    path("conversation/", views.conversation_view),
    path("messages/", views.messages_view),
    path("messages/<int:message_id>/presign/", views.presign_view),
    path("messages/<int:message_id>/confirm-attach/", views.confirm_attach_view),
    path("conversation/read/", views.mark_read_view),

    # Admin
    path("admin/conversations/", views.admin_conversations_list),
    path("admin/conversations/<int:conversation_id>/", views.admin_conversation_detail),
    path("admin/conversations/<int:conversation_id>/messages/", views.admin_conversation_messages),
    path("admin/conversations/<int:conversation_id>/reward/", views.admin_reward_view),
    path("admin/conversations/<int:conversation_id>/read/", views.admin_mark_read_view),
    path("admin/messages/<int:message_id>/", views.admin_delete_message),
]
```

- [ ] **Step 3: Add to config/urls.py**

Add to `urlpatterns` in `backend/config/urls.py`:

```python
path('api/feedback/', include('apps.feedback.urls')),
```

- [ ] **Step 4: Commit**

```bash
git add backend/apps/feedback/views.py backend/apps/feedback/urls.py backend/config/urls.py
git commit -m "feat(feedback): user + admin API views and URL routing"
```

---

### Task 6: Backend — WebSocket consumer + routing

**Files:**
- Create: `backend/apps/feedback/consumers.py`
- Create: `backend/apps/feedback/routing.py`
- Modify: `backend/config/asgi.py`

- [ ] **Step 1: Write consumers.py**

```python
# backend/apps/feedback/consumers.py
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Conversation


class FeedbackChatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.conversation_id = self.scope["url_route"]["kwargs"]["conversation_id"]
        self.group_name = f"feedback_{self.conversation_id}"
        user = self.scope.get("user")

        if not user or user.is_anonymous:
            await self.close()
            return

        # Проверка доступа: владелец диалога или staff
        has_access = await self._check_access(user)
        if not has_access:
            await self.close()
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def new_message(self, event):
        await self.send_json(event)

    async def attachment_ready(self, event):
        await self.send_json(event)

    async def conversation_updated(self, event):
        await self.send_json(event)

    async def reward_granted(self, event):
        await self.send_json(event)

    @database_sync_to_async
    def _check_access(self, user):
        if user.is_staff:
            return Conversation.objects.filter(id=self.conversation_id).exists()
        return Conversation.objects.filter(id=self.conversation_id, user=user).exists()
```

- [ ] **Step 2: Write routing.py**

```python
# backend/apps/feedback/routing.py
from django.urls import path
from .consumers import FeedbackChatConsumer

websocket_urlpatterns = [
    path("ws/feedback/<int:conversation_id>/", FeedbackChatConsumer.as_asgi()),
]
```

- [ ] **Step 3: Update asgi.py to merge WS routes**

Replace the current import + URLRouter section in `backend/config/asgi.py`:

```python
import os
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

django_asgi_app = get_asgi_application()

from apps.projects.routing import websocket_urlpatterns as project_ws  # noqa: E402
from apps.feedback.routing import websocket_urlpatterns as feedback_ws  # noqa: E402
from apps.projects.middleware import JWTAuthMiddleware  # noqa: E402

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': JWTAuthMiddleware(
        URLRouter(project_ws + feedback_ws)
    ),
})
```

Note: `apps.projects.routing.websocket_urlpatterns` already includes notification WS routes (they are aggregated there). No need to import notifications separately.

- [ ] **Step 4: Commit**

```bash
git add backend/apps/feedback/consumers.py backend/apps/feedback/routing.py backend/config/asgi.py
git commit -m "feat(feedback): WebSocket consumer + routing"
```

---

### Task 7: Backend — Celery tasks

**Files:**
- Create: `backend/apps/feedback/tasks.py`
- Modify: `backend/config/settings.py` (CELERY_BEAT_SCHEDULE)

- [ ] **Step 1: Write tasks.py**

```python
# backend/apps/feedback/tasks.py
import io
import logging
import uuid
from datetime import timedelta

import boto3
from celery import shared_task
from django.conf import settings
from django.utils import timezone
from PIL import Image

from .models import Attachment, Message

logger = logging.getLogger(__name__)

MAX_DIMENSION = 800
JPEG_QUALITY = 85


def _get_s3():
    return boto3.client(
        "s3",
        endpoint_url=settings.AWS_S3_ENDPOINT_URL,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_S3_REGION_NAME,
    )


@shared_task(bind=True, max_retries=3, soft_time_limit=60)
def process_feedback_attachment(
    self, conversation_id, message_id, tmp_file_key, file_name, content_type,
):
    """Скачать из S3 tmp, resize, upload в final, удалить tmp."""
    s3 = _get_s3()
    bucket = settings.AWS_STORAGE_BUCKET_NAME

    try:
        # Скачать из tmp
        response = s3.get_object(Bucket=bucket, Key=tmp_file_key)
        data = response["Body"].read()

        # Валидация MIME по magic bytes (не доверяем content_type от клиента)
        import magic
        detected_mime = magic.from_buffer(data[:2048], mime=True)
        allowed_mimes = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
        if detected_mime not in allowed_mimes:
            logger.warning("Rejected feedback attachment: detected MIME %s", detected_mime)
            s3.delete_object(Bucket=bucket, Key=tmp_file_key)
            return

        is_image = detected_mime.startswith("image/")

        if is_image:
            # Resize
            img = Image.open(io.BytesIO(data))
            img = img.convert("RGB")  # strip alpha, normalize

            # Resize to max 800px
            w, h = img.size
            if max(w, h) > MAX_DIMENSION:
                ratio = MAX_DIMENSION / max(w, h)
                img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
            buf.seek(0)
            processed_data = buf.read()
            final_ext = ".jpg"
            final_ct = "image/jpeg"
        else:
            # PDF: as-is
            processed_data = data
            final_ext = ".pdf"
            final_ct = "application/pdf"

        # Upload to final path
        final_key = f"feedback/{conversation_id}/{uuid.uuid4()}{final_ext}"
        s3.put_object(
            Bucket=bucket,
            Key=final_key,
            Body=processed_data,
            ContentType=final_ct,
        )

        # Delete tmp
        s3.delete_object(Bucket=bucket, Key=tmp_file_key)

        # Create Attachment record
        msg = Message.objects.get(id=message_id)
        attachment = Attachment.objects.create(
            message=msg,
            file_key=final_key,
            file_name=file_name,
            file_size=len(processed_data),
            content_type=final_ct,
        )

        # Notify via WS
        from .services import notify_attachment_ready
        notify_attachment_ready(conversation_id, message_id, {
            "id": attachment.id,
            "file_name": attachment.file_name,
            "file_size": attachment.file_size,
            "content_type": attachment.content_type,
            "is_expired": False,
        })

        logger.info("Feedback attachment processed: %s → %s", tmp_file_key, final_key)

    except Exception as exc:
        logger.exception("Failed to process feedback attachment: %s", tmp_file_key)
        raise self.retry(exc=exc, countdown=30)


@shared_task
def cleanup_feedback_tmp():
    """Удалить файлы в feedback/tmp/ старше 1 часа."""
    s3 = _get_s3()
    bucket = settings.AWS_STORAGE_BUCKET_NAME
    cutoff = timezone.now() - timedelta(hours=1)

    response = s3.list_objects_v2(Bucket=bucket, Prefix="feedback/tmp/")
    deleted = 0

    for obj in response.get("Contents", []):
        if obj["LastModified"].replace(tzinfo=None) < cutoff.replace(tzinfo=None):
            s3.delete_object(Bucket=bucket, Key=obj["Key"])
            deleted += 1

    if deleted:
        logger.info("Cleaned up %d stale feedback tmp files", deleted)


@shared_task
def cleanup_old_attachments():
    """Удалить вложения старше 90 дней, пометить is_expired."""
    cutoff = timezone.now() - timedelta(days=90)
    attachments = Attachment.objects.filter(created_at__lt=cutoff, is_expired=False)

    s3 = _get_s3()
    bucket = settings.AWS_STORAGE_BUCKET_NAME
    count = 0

    for att in attachments:
        try:
            s3.delete_object(Bucket=bucket, Key=att.file_key)
        except Exception:
            logger.warning("Failed to delete S3 key: %s", att.file_key)
        att.is_expired = True
        att.file_key = ""
        att.save(update_fields=["is_expired", "file_key"])
        count += 1

    if count:
        logger.info("Expired %d old feedback attachments", count)
```

- [ ] **Step 2: Add periodic tasks to CELERY_BEAT_SCHEDULE**

In `backend/config/settings.py`, add to `CELERY_BEAT_SCHEDULE`:

```python
'cleanup-feedback-tmp': {
    'task': 'apps.feedback.tasks.cleanup_feedback_tmp',
    'schedule': 3600.0,  # every hour
},
'cleanup-old-feedback-attachments': {
    'task': 'apps.feedback.tasks.cleanup_old_attachments',
    'schedule': 86400.0,  # every 24 hours
},
```

- [ ] **Step 3: Commit**

```bash
git add backend/apps/feedback/tasks.py backend/config/settings.py
git commit -m "feat(feedback): Celery tasks — attachment processing + cleanup"
```

---

### Task 8: Backend — Tests

**Files:**
- Create: `backend/apps/feedback/tests.py`

- [ ] **Step 1: Write tests**

```python
# backend/apps/feedback/tests.py
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from .models import Conversation, Message, Attachment, FeedbackReward

User = get_user_model()


def _make_user(username="testuser", is_staff=False):
    user = User.objects.create_user(username=username, password="test123")
    if is_staff:
        user.is_staff = True
        user.save(update_fields=["is_staff"])
    return user


def _make_conversation(user):
    return Conversation.objects.create(user=user)


def _make_message(conv, sender, is_admin=False, text="test"):
    return Message.objects.create(
        conversation=conv, sender=sender, is_admin=is_admin, text=text,
    )


class TestConversationModel(TestCase):
    def test_one_conversation_per_user(self):
        user = _make_user()
        conv = _make_conversation(user)
        self.assertEqual(conv.status, Conversation.STATUS_OPEN)
        self.assertEqual(conv.user, user)

    def test_ordering_by_updated_at(self):
        u1 = _make_user("user1")
        u2 = _make_user("user2")
        c1 = _make_conversation(u1)
        c2 = _make_conversation(u2)
        _make_message(c1, u1)  # touches c1 updated_at
        convs = list(Conversation.objects.all())
        self.assertEqual(convs[0].id, c2.id)  # c2 more recent


class TestUserAPI(TestCase):
    def setUp(self):
        self.user = _make_user()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_get_conversation_404_when_none(self):
        resp = self.client.get("/api/feedback/conversation/")
        self.assertEqual(resp.status_code, 404)

    def test_create_conversation(self):
        resp = self.client.post("/api/feedback/conversation/")
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(Conversation.objects.filter(user=self.user).exists())

    def test_send_message(self):
        resp = self.client.post("/api/feedback/messages/", {"text": "Bug report"})
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(Message.objects.count(), 1)
        msg = Message.objects.first()
        self.assertEqual(msg.text, "Bug report")
        self.assertFalse(msg.is_admin)

    def test_send_message_creates_conversation_if_missing(self):
        self.client.post("/api/feedback/messages/", {"text": "Hello"})
        self.assertTrue(Conversation.objects.filter(user=self.user).exists())

    def test_send_message_reopens_resolved(self):
        conv = _make_conversation(self.user)
        conv.status = Conversation.STATUS_RESOLVED
        conv.save()
        self.client.post("/api/feedback/messages/", {"text": "Still broken"})
        conv.refresh_from_db()
        self.assertEqual(conv.status, Conversation.STATUS_OPEN)

    def test_get_messages(self):
        conv = _make_conversation(self.user)
        _make_message(conv, self.user, text="msg1")
        _make_message(conv, self.user, text="msg2")
        resp = self.client.get("/api/feedback/messages/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)

    def test_mark_read(self):
        conv = _make_conversation(self.user)
        resp = self.client.post("/api/feedback/conversation/read/")
        self.assertEqual(resp.status_code, 200)
        conv.refresh_from_db()
        self.assertIsNotNone(conv.user_last_read_at)


class TestAdminAPI(TestCase):
    def setUp(self):
        self.admin = _make_user("admin", is_staff=True)
        self.user = _make_user("user1")
        self.conv = _make_conversation(self.user)
        _make_message(self.conv, self.user, text="Help!")
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def test_list_conversations(self):
        resp = self.client.get("/api/feedback/admin/conversations/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_filter_by_status(self):
        resp = self.client.get("/api/feedback/admin/conversations/?status=resolved")
        self.assertEqual(len(resp.data), 0)

    def test_admin_reply(self):
        resp = self.client.post(
            f"/api/feedback/admin/conversations/{self.conv.id}/messages/",
            {"text": "Fixed!"},
        )
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data["is_admin"])

    def test_update_status(self):
        resp = self.client.patch(
            f"/api/feedback/admin/conversations/{self.conv.id}/",
            {"status": "resolved"},
        )
        self.assertEqual(resp.status_code, 200)
        self.conv.refresh_from_db()
        self.assertEqual(self.conv.status, Conversation.STATUS_RESOLVED)

    def test_update_tag(self):
        self.client.patch(
            f"/api/feedback/admin/conversations/{self.conv.id}/",
            {"tag": "bug"},
        )
        self.conv.refresh_from_db()
        self.assertEqual(self.conv.tag, Conversation.TAG_BUG)

    @patch("apps.feedback.services.CreditsService")
    @patch("apps.feedback.services.create_notification")
    def test_grant_reward(self, mock_notify, mock_cs_class):
        mock_cs = MagicMock()
        mock_cs.topup.return_value = MagicMock(balance_after=Decimal("100"))
        mock_cs_class.return_value = mock_cs

        resp = self.client.post(
            f"/api/feedback/admin/conversations/{self.conv.id}/reward/",
            {"amount": "50", "comment": "За баг"},
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(FeedbackReward.objects.count(), 1)
        mock_cs.topup.assert_called_once()

    def test_delete_message(self):
        msg = _make_message(self.conv, self.user, text="spam")
        resp = self.client.delete(f"/api/feedback/admin/messages/{msg.id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Message.objects.filter(id=msg.id).exists())

    def test_admin_mark_read(self):
        resp = self.client.post(
            f"/api/feedback/admin/conversations/{self.conv.id}/read/"
        )
        self.assertEqual(resp.status_code, 200)
        self.conv.refresh_from_db()
        self.assertIsNotNone(self.conv.admin_last_read_at)

    def test_non_staff_cannot_access_admin_endpoints(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.get("/api/feedback/admin/conversations/")
        self.assertEqual(resp.status_code, 403)
```

- [ ] **Step 2: Run tests**

```bash
docker compose exec backend python manage.py test apps.feedback -v2
```

- [ ] **Step 3: Commit**

```bash
git add backend/apps/feedback/tests.py
git commit -m "test(feedback): model + API tests for user and admin endpoints"
```

---

### Task 9: Frontend — Types + API client + WS client

**Files:**
- Modify: `frontend/lib/types/index.ts`
- Create: `frontend/lib/api/feedback.ts`
- Create: `frontend/lib/api/feedback-ws.ts`

- [ ] **Step 1: Add types to index.ts**

Add at the end of `frontend/lib/types/index.ts`:

```typescript
// ─── Feedback ─────────────────────────────────────────

export interface FeedbackAttachment {
  id: number
  file_name: string
  file_size: number
  content_type: string
  url: string | null
  is_expired: boolean
  created_at: string
}

export interface FeedbackMessage {
  id: number
  sender_name: string
  is_admin: boolean
  text: string
  attachments: FeedbackAttachment[]
  created_at: string
}

export interface FeedbackConversation {
  id: number
  status: 'open' | 'resolved'
  tag: '' | 'bug' | 'question' | 'idea'
  created_at: string
  updated_at: string
  last_message_preview: { text: string; is_admin: boolean; created_at: string } | null
  unread_count: number
}

export interface AdminConversationUser {
  id: number
  username: string
  email: string
  date_joined: string
  balance: string
}

export interface AdminConversation {
  id: number
  user: AdminConversationUser
  status: 'open' | 'resolved'
  tag: '' | 'bug' | 'question' | 'idea'
  created_at: string
  updated_at: string
  last_message_preview: { text: string; is_admin: boolean; created_at: string } | null
  unread_by_admin: number
  rewards_total: string
}
```

Also add to `NotificationType` union:

```typescript
| 'feedback_new' | 'feedback_reply' | 'feedback_reward'
```

- [ ] **Step 2: Write API client**

```typescript
// frontend/lib/api/feedback.ts
import { client } from './client'
import type {
  FeedbackConversation,
  FeedbackMessage,
  AdminConversation,
} from '@/lib/types'

export const feedbackApi = {
  // User
  getConversation: () =>
    client.get<FeedbackConversation>('/feedback/conversation/'),
  createConversation: () =>
    client.post<FeedbackConversation>('/feedback/conversation/'),
  getMessages: (cursor?: number) =>
    client.get<FeedbackMessage[]>('/feedback/messages/', {
      params: cursor ? { cursor } : undefined,
    }),
  sendMessage: (text: string) =>
    client.post<FeedbackMessage>('/feedback/messages/', { text }),
  presignAttachment: (messageId: number, fileName: string, contentType: string) =>
    client.post<{ upload_url: string; file_key: string }>(
      `/feedback/messages/${messageId}/presign/`,
      { file_name: fileName, content_type: contentType },
    ),
  confirmAttachment: (messageId: number, fileKey: string, fileName: string, fileSize: number, contentType: string) =>
    client.post(
      `/feedback/messages/${messageId}/confirm-attach/`,
      { file_key: fileKey, file_name: fileName, file_size: fileSize, content_type: contentType },
    ),
  markRead: () =>
    client.post('/feedback/conversation/read/'),

  // Admin
  getConversations: (params?: { status?: string; tag?: string; search?: string }) =>
    client.get<AdminConversation[]>('/feedback/admin/conversations/', { params }),
  getConversationDetail: (id: number) =>
    client.get<AdminConversation>(`/feedback/admin/conversations/${id}/`),
  getConversationMessages: (id: number, cursor?: number) =>
    client.get<FeedbackMessage[]>(
      `/feedback/admin/conversations/${id}/messages/`,
      { params: cursor ? { cursor } : undefined },
    ),
  sendAdminReply: (id: number, text: string) =>
    client.post<FeedbackMessage>(
      `/feedback/admin/conversations/${id}/messages/`,
      { text },
    ),
  updateConversation: (id: number, data: { status?: string; tag?: string }) =>
    client.patch<AdminConversation>(
      `/feedback/admin/conversations/${id}/`,
      data,
    ),
  grantReward: (id: number, amount: number, comment: string) =>
    client.post(
      `/feedback/admin/conversations/${id}/reward/`,
      { amount, comment },
    ),
  adminMarkRead: (id: number) =>
    client.post(`/feedback/admin/conversations/${id}/read/`),
  deleteMessage: (messageId: number) =>
    client.delete(`/feedback/admin/messages/${messageId}/`),
}
```

- [ ] **Step 3: Write WS manager**

```typescript
// frontend/lib/api/feedback-ws.ts
import Cookies from 'js-cookie'

type FeedbackWSEvent =
  | { type: 'new_message'; message: import('@/lib/types').FeedbackMessage }
  | { type: 'attachment_ready'; message_id: number; attachment: import('@/lib/types').FeedbackAttachment }
  | { type: 'conversation_updated'; status: string; tag: string }
  | { type: 'reward_granted'; amount: string; comment: string; message: import('@/lib/types').FeedbackMessage }

type Handler = (event: FeedbackWSEvent) => void

class FeedbackWSManager {
  private ws: WebSocket | null = null
  private handlers = new Set<Handler>()
  private conversationId: number | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  connect(conversationId: number) {
    this.conversationId = conversationId
    this.reconnectAttempts = 0
    this._connect()
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
    this.conversationId = null
  }

  on(handler: Handler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  private _connect() {
    if (!this.conversationId) return
    const token = Cookies.get('access_token') || localStorage.getItem('access_token')
    const wsBase = process.env.NEXT_PUBLIC_WS_URL || `ws://${window.location.hostname}:8000`
    const url = `${wsBase}/ws/feedback/${this.conversationId}/?token=${token}`

    this.ws = new WebSocket(url)

    this.ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as FeedbackWSEvent
        this.handlers.forEach((h) => h(event))
      } catch { /* ignore parse errors */ }
    }

    this.ws.onclose = () => {
      if (this.conversationId && this.reconnectAttempts < this.maxReconnectAttempts) {
        const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000)
        this.reconnectTimer = setTimeout(() => {
          this.reconnectAttempts++
          this._connect()
        }, delay)
      }
    }
  }
}

export const feedbackWS = new FeedbackWSManager()
```

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/types/index.ts frontend/lib/api/feedback.ts frontend/lib/api/feedback-ws.ts
git commit -m "feat(feedback): frontend types, API client, WebSocket manager"
```

---

### Task 10: Frontend — Zustand stores

**Files:**
- Create: `frontend/lib/store/feedback.ts`
- Create: `frontend/lib/store/feedback-admin.ts`

- [ ] **Step 1: Write user feedback store**

```typescript
// frontend/lib/store/feedback.ts
import { create } from 'zustand'
import { feedbackApi } from '@/lib/api/feedback'
import { feedbackWS } from '@/lib/api/feedback-ws'
import type { FeedbackConversation, FeedbackMessage, FeedbackAttachment } from '@/lib/types'

interface FeedbackState {
  conversation: FeedbackConversation | null
  messages: FeedbackMessage[]
  hasUnreadReply: boolean
  isLoading: boolean
  wsConnected: boolean

  loadConversation: () => Promise<void>
  loadMessages: (cursor?: number) => Promise<void>
  sendMessage: (text: string) => Promise<FeedbackMessage | null>
  uploadAttachment: (messageId: number, file: File) => Promise<void>
  markAsRead: () => Promise<void>
  connectWS: () => void
  disconnectWS: () => void
  checkUnread: () => Promise<void>
}

export const useFeedbackStore = create<FeedbackState>((set, get) => {
  let wsUnsub: (() => void) | null = null

  return {
    conversation: null,
    messages: [],
    hasUnreadReply: false,
    isLoading: false,
    wsConnected: false,

    loadConversation: async () => {
      try {
        const { data } = await feedbackApi.getConversation()
        set({ conversation: data, hasUnreadReply: data.unread_count > 0 })
      } catch {
        set({ conversation: null })
      }
    },

    loadMessages: async (cursor) => {
      const conv = get().conversation
      if (!conv) return
      set({ isLoading: true })
      try {
        const { data } = await feedbackApi.getMessages(cursor)
        set((s) => ({
          messages: cursor ? [...data, ...s.messages] : data,
        }))
      } finally {
        set({ isLoading: false })
      }
    },

    sendMessage: async (text) => {
      try {
        const { data } = await feedbackApi.sendMessage(text)
        // Conversation will be created by backend if needed
        if (!get().conversation) {
          await get().loadConversation()
          get().connectWS()
        }
        set((s) => ({ messages: [...s.messages, data] }))
        return data
      } catch {
        return null
      }
    },

    uploadAttachment: async (messageId, file) => {
      const { data: presign } = await feedbackApi.presignAttachment(
        messageId, file.name, file.type,
      )
      // Direct upload to S3
      await fetch(presign.upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      // Confirm
      await feedbackApi.confirmAttachment(
        messageId, presign.file_key, file.name, file.size, file.type,
      )
    },

    markAsRead: async () => {
      await feedbackApi.markRead()
      set({ hasUnreadReply: false })
    },

    connectWS: () => {
      const conv = get().conversation
      if (!conv || get().wsConnected) return

      feedbackWS.connect(conv.id)
      wsUnsub = feedbackWS.on((event) => {
        if (event.type === 'new_message' || event.type === 'reward_granted') {
          const msg = 'message' in event ? event.message : null
          if (msg) {
            set((s) => ({
              messages: [...s.messages, msg],
              hasUnreadReply: msg.is_admin ? true : s.hasUnreadReply,
            }))
          }
        }
        if (event.type === 'attachment_ready') {
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === event.message_id
                ? { ...m, attachments: [...m.attachments, event.attachment] }
                : m,
            ),
          }))
        }
        if (event.type === 'conversation_updated') {
          set((s) => ({
            conversation: s.conversation
              ? { ...s.conversation, status: event.status as 'open' | 'resolved', tag: event.tag as '' | 'bug' | 'question' | 'idea' }
              : null,
          }))
        }
      })
      set({ wsConnected: true })
    },

    disconnectWS: () => {
      wsUnsub?.()
      feedbackWS.disconnect()
      set({ wsConnected: false })
    },

    checkUnread: async () => {
      try {
        const { data } = await feedbackApi.getConversation()
        set({ hasUnreadReply: data.unread_count > 0 })
      } catch {
        // no conversation yet
      }
    },
  }
})
```

- [ ] **Step 2: Write admin feedback store**

```typescript
// frontend/lib/store/feedback-admin.ts
import { create } from 'zustand'
import { feedbackApi } from '@/lib/api/feedback'
import { feedbackWS } from '@/lib/api/feedback-ws'
import type { AdminConversation, FeedbackMessage } from '@/lib/types'

interface FeedbackAdminState {
  conversations: AdminConversation[]
  activeConversation: AdminConversation | null
  messages: FeedbackMessage[]
  filters: { status?: string; tag?: string; search?: string }
  isLoading: boolean

  loadConversations: () => Promise<void>
  selectConversation: (id: number) => Promise<void>
  sendReply: (text: string) => Promise<void>
  updateConversation: (id: number, data: { status?: string; tag?: string }) => Promise<void>
  grantReward: (id: number, amount: number, comment: string) => Promise<void>
  setFilters: (filters: { status?: string; tag?: string; search?: string }) => void
  connectWS: (conversationId: number) => void
  disconnectWS: () => void
}

export const useFeedbackAdminStore = create<FeedbackAdminState>((set, get) => {
  let wsUnsub: (() => void) | null = null

  return {
    conversations: [],
    activeConversation: null,
    messages: [],
    filters: {},
    isLoading: false,

    loadConversations: async () => {
      set({ isLoading: true })
      try {
        const { data } = await feedbackApi.getConversations(get().filters)
        set({ conversations: data })
      } finally {
        set({ isLoading: false })
      }
    },

    selectConversation: async (id) => {
      const conv = get().conversations.find((c) => c.id === id) || null
      set({ activeConversation: conv, messages: [] })

      if (conv) {
        const { data } = await feedbackApi.getConversationMessages(id)
        set({ messages: data })
        await feedbackApi.adminMarkRead(id)
        get().connectWS(id)
      }
    },

    sendReply: async (text) => {
      const conv = get().activeConversation
      if (!conv) return
      const { data } = await feedbackApi.sendAdminReply(conv.id, text)
      set((s) => ({ messages: [...s.messages, data] }))
    },

    updateConversation: async (id, data) => {
      const { data: updated } = await feedbackApi.updateConversation(id, data)
      set((s) => ({
        conversations: s.conversations.map((c) => (c.id === id ? updated : c)),
        activeConversation: s.activeConversation?.id === id ? updated : s.activeConversation,
      }))
    },

    grantReward: async (id, amount, comment) => {
      await feedbackApi.grantReward(id, amount, comment)
      // Reward message comes via WS
    },

    setFilters: (filters) => {
      set({ filters })
      get().loadConversations()
    },

    connectWS: (conversationId) => {
      wsUnsub?.()
      feedbackWS.disconnect()

      feedbackWS.connect(conversationId)
      wsUnsub = feedbackWS.on((event) => {
        if (event.type === 'new_message' || event.type === 'reward_granted') {
          const msg = 'message' in event ? event.message : null
          if (msg) set((s) => ({ messages: [...s.messages, msg] }))
        }
        if (event.type === 'attachment_ready') {
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === event.message_id
                ? { ...m, attachments: [...m.attachments, event.attachment] }
                : m,
            ),
          }))
        }
      })
    },

    disconnectWS: () => {
      wsUnsub?.()
      feedbackWS.disconnect()
    },
  }
})
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/store/feedback.ts frontend/lib/store/feedback-admin.ts
git commit -m "feat(feedback): Zustand stores for user + admin feedback"
```

---

### Task 11: Frontend — Shared UI components

**Files:**
- Create: `frontend/components/feedback/MessageBubble.tsx`
- Create: `frontend/components/feedback/AttachmentPreview.tsx`
- Create: `frontend/components/feedback/SystemMessage.tsx`
- Create: `frontend/components/feedback/RewardModal.tsx`

These are shared components used by both user chat and admin inbox. Follow existing patterns from `CommentThread.tsx` for styling (avatar, bubble layout, relative time).

- [ ] **Step 1: Create `components/feedback/` directory and write MessageBubble, AttachmentPreview, SystemMessage, RewardModal**

Each component should follow shadcn/ui patterns, use Tailwind classes matching the existing dark theme, Russian text for UI labels.

Key specs per component:
- **MessageBubble**: user messages left-aligned (`bg-muted`), admin right-aligned (`bg-primary/20`), sender name, time, attachments slot
- **AttachmentPreview**: clickable image thumbnail (if image), file icon + name + size (if PDF), "Вложение удалено" placeholder (if `is_expired`)
- **SystemMessage**: centered text with muted bg, used for rewards and status changes
- **RewardModal**: Dialog with amount input (number), comment textarea, submit button. Uses `Dialog` from shadcn/ui

- [ ] **Step 2: Commit**

```bash
git add frontend/components/feedback/
git commit -m "feat(feedback): shared UI components — bubbles, attachments, reward modal"
```

---

### Task 12: Frontend — FeedbackButton + FeedbackDropdown (navbar)

**Files:**
- Create: `frontend/components/feedback/FeedbackButton.tsx`
- Create: `frontend/components/feedback/FeedbackDropdown.tsx`
- Modify: `frontend/components/layout/Navbar.tsx`

- [ ] **Step 1: Write FeedbackButton**

Pill button: `MessageCircle` icon + "Связаться с нами" text. Green dot badge when `hasUnreadReply`. Wrapped in `Popover` trigger.

- [ ] **Step 2: Write FeedbackDropdown**

Popover content (width 320px):
- Header: "Связаться с нами"
- Messages preview (last 5, using MessageBubble)
- Input: textarea + file button + send button
- Footer: "Перейти к полной переписке →" link to `/cabinet/feedback`
- Muted hint under input: "Вложения хранятся 90 дней"
- Empty state: "Нашли баг? Есть идея? Напишите — мы читаем каждое сообщение."

On mount: call `checkUnread()`. On open: `loadConversation()` + `loadMessages()` + `connectWS()`.

- [ ] **Step 3: Add to Navbar.tsx**

In `Navbar.tsx`, import `FeedbackButton` and add between the balance badge and `NotificationDropdown`:

```tsx
{user && <FeedbackButton />}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/components/feedback/FeedbackButton.tsx frontend/components/feedback/FeedbackDropdown.tsx frontend/components/layout/Navbar.tsx
git commit -m "feat(feedback): navbar pill + dropdown for quick messages"
```

---

### Task 13: Frontend — Cabinet feedback page

**Files:**
- Create: `frontend/components/feedback/FeedbackChat.tsx`
- Create: `frontend/app/(cabinet)/cabinet/feedback/page.tsx`
- Modify: `frontend/app/(cabinet)/cabinet/layout.tsx`

- [ ] **Step 1: Write FeedbackChat.tsx**

Full-screen chat component:
- Header: "Обратная связь" + status badge (open/resolved)
- Messages list with date separators, MessageBubble, AttachmentPreview, SystemMessage
- Input bar: textarea (auto-resize), file attach button (📎), send button (➤)
- File input: hidden `<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf">`
- On mount: `loadConversation()` → `loadMessages()` → `connectWS()` → `markAsRead()`
- On unmount: `disconnectWS()`
- Scroll to bottom on new messages

- [ ] **Step 2: Write page.tsx**

```tsx
// frontend/app/(cabinet)/cabinet/feedback/page.tsx
import { FeedbackChat } from '@/components/feedback/FeedbackChat'

export default function FeedbackPage() {
  return <FeedbackChat />
}
```

- [ ] **Step 3: Add to cabinet sidebar**

In `frontend/app/(cabinet)/cabinet/layout.tsx`, add to `NAV_SECTIONS` in the "Инструменты" section, between "Хранилище" and "Уведомления":

```typescript
{ href: "/cabinet/feedback", label: "Обратная связь", icon: MessageCircle },
```

Import `MessageCircle` from `lucide-react`.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/feedback/FeedbackChat.tsx frontend/app/\(cabinet\)/cabinet/feedback/page.tsx frontend/app/\(cabinet\)/cabinet/layout.tsx
git commit -m "feat(feedback): cabinet feedback page with full chat UI"
```

---

### Task 14: Frontend — Admin feedback inbox

**Files:**
- Create: `frontend/components/feedback/ConversationList.tsx`
- Create: `frontend/components/feedback/AdminChatPanel.tsx`
- Create: `frontend/components/feedback/AdminFeedbackInbox.tsx`
- Create: `frontend/app/(workspace)/admin/feedback/page.tsx`

- [ ] **Step 1: Write ConversationList.tsx**

Left sidebar (280px):
- Search input
- Filter pills: Все / Открытые / Решённые + tag filters
- List of conversations: avatar (initials), username, preview, time, tags, unread dot
- Active conversation highlighted with primary border-left

- [ ] **Step 2: Write AdminChatPanel.tsx**

Right panel:
- Header: avatar, name, @username (link to Django Admin `/admin/users/user/{id}/change/`), email, date, balance
- Action buttons: "⚡ Начислить" (opens RewardModal), "✓ Решено" (toggles status), tag selector, "•••" menu (delete message)
- Messages list (same as FeedbackChat but with admin input)
- Input bar

- [ ] **Step 3: Write AdminFeedbackInbox.tsx**

Combines ConversationList + AdminChatPanel in a flex layout. On mount: `loadConversations()`. Handles conversation selection, WS connection switching.

- [ ] **Step 4: Write page.tsx with is_staff guard**

```tsx
// frontend/app/(workspace)/admin/feedback/page.tsx
'use client'
import { useAuthStore } from '@/lib/store/auth'
import { redirect } from 'next/navigation'
import { AdminFeedbackInbox } from '@/components/feedback/AdminFeedbackInbox'

export default function AdminFeedbackPage() {
  const user = useAuthStore((s) => s.user)
  if (!user?.is_staff) redirect('/projects')
  return <AdminFeedbackInbox />
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/components/feedback/ConversationList.tsx frontend/components/feedback/AdminChatPanel.tsx frontend/components/feedback/AdminFeedbackInbox.tsx frontend/app/\(workspace\)/admin/feedback/page.tsx
git commit -m "feat(feedback): admin Telegram-style inbox with conversation list + chat"
```

---

### Task 15: Integration + Docker rebuild

- [ ] **Step 1: Rebuild backend container** (picks up python-magic)

```bash
docker compose up --build backend
```

- [ ] **Step 2: Run migrations**

```bash
docker compose exec backend python manage.py migrate
```

- [ ] **Step 3: Run backend tests**

```bash
docker compose exec backend python manage.py test apps.feedback -v2
```

- [ ] **Step 4: Rebuild frontend**

```bash
docker compose up --build frontend
```

- [ ] **Step 5: Manual smoke test**

1. Open app → navbar shows "Связаться с нами" pill
2. Click pill → dropdown opens with welcome text
3. Type message → send → message appears
4. Attach image → uploads → preview appears after resize
5. Open `/cabinet/feedback` → full chat with history
6. Login as admin → open `/admin/feedback` → conversation list shows
7. Select conversation → reply → user sees reply in real-time
8. Click "⚡ Начислить" → reward modal → grant → system message appears
9. Click "✓ Решено" → status changes
10. Check S3: files in `feedback/{id}/`, no originals, images are ~800px

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix(feedback): integration fixes after smoke test"
```
