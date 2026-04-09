from django.conf import settings
from django.db import models


class Notification(models.Model):
    class Type(models.TextChoices):
        COMMENT_NEW = 'comment_new', 'Новый комментарий'
        REACTION_NEW = 'reaction_new', 'Новая реакция'
        REVIEW_NEW = 'review_new', 'Новое решение по ревью'
        GENERATION_COMPLETED = 'generation_completed', 'Генерация завершена'
        GENERATION_FAILED = 'generation_failed', 'Ошибка генерации'
        UPLOAD_COMPLETED = 'upload_completed', 'Загрузка завершена'
        FEEDBACK_NEW = 'feedback_new', 'Новое обращение'
        FEEDBACK_REPLY = 'feedback_reply', 'Ответ на обращение'
        FEEDBACK_REWARD = 'feedback_reward', 'Награда за обратную связь'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='notifications'
    )
    type = models.CharField(max_length=30, choices=Type.choices)

    project = models.ForeignKey(
        'projects.Project', null=True, on_delete=models.CASCADE
    )
    element = models.ForeignKey(
        'elements.Element', null=True, blank=True, on_delete=models.SET_NULL
    )
    scene = models.ForeignKey(
        'scenes.Scene', null=True, blank=True, on_delete=models.SET_NULL
    )
    comment = models.ForeignKey(
        'sharing.Comment', null=True, blank=True, on_delete=models.SET_NULL
    )

    title = models.CharField(max_length=200)
    message = models.TextField(blank=True, default='')

    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'is_read', '-created_at']),
        ]

    def __str__(self):
        return f"{self.type}: {self.title}"
