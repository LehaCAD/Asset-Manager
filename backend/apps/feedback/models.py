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
