import uuid
from django.conf import settings
from django.db import models


class SharedLink(models.Model):
    """Публичная ссылка на проект для просмотра без авторизации."""

    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        related_name='shared_links',
        verbose_name='Проект'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='shared_links',
        verbose_name='Создатель'
    )
    name = models.CharField(
        max_length=100,
        blank=True,
        default='',
        verbose_name='Название'
    )
    elements = models.ManyToManyField(
        'elements.Element',
        related_name='shared_links',
        blank=True,
        verbose_name='Элементы'
    )
    display_preferences = models.JSONField(default=dict, blank=True)
    token = models.UUIDField(
        unique=True,
        default=uuid.uuid4,
        editable=False,
        verbose_name='Токен',
        help_text='Уникальный токен для публичного доступа'
    )
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Срок действия',
        help_text='Если пусто — без срока действия'
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата создания'
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='Дата обновления'
    )

    class Meta:
        verbose_name = 'Публичная ссылка'
        verbose_name_plural = 'Публичные ссылки'
        ordering = ['-created_at']

    def __str__(self) -> str:
        expires = f'до {self.expires_at.strftime("%d.%m.%Y")}' if self.expires_at else 'бессрочная'
        return f'Ссылка на "{self.project.name}" ({expires})'
    
    def is_expired(self) -> bool:
        """Проверка, истек ли срок действия ссылки."""
        if not self.expires_at:
            return False
        from django.utils import timezone
        return timezone.now() > self.expires_at


class Comment(models.Model):
    """Комментарий к группе или элементу (единый тред, поддержка ответов)."""

    scene = models.ForeignKey(
        'scenes.Scene', null=True, blank=True,
        on_delete=models.CASCADE, related_name='comments'
    )
    element = models.ForeignKey(
        'elements.Element', null=True, blank=True,
        on_delete=models.CASCADE, related_name='comments'
    )
    shared_link = models.ForeignKey(
        'sharing.SharedLink', null=True, blank=True,
        on_delete=models.CASCADE, related_name='comments'
    )
    parent = models.ForeignKey(
        'self', null=True, blank=True,
        on_delete=models.CASCADE, related_name='replies'
    )
    author_name = models.CharField(max_length=100)
    author_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='comments'
    )
    session_id = models.CharField(max_length=36, default='', blank=True)
    text = models.TextField(max_length=2000)
    is_read = models.BooleanField(default=False)
    is_system = models.BooleanField(default=False, verbose_name='Системный комментарий')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(scene__isnull=False, element__isnull=True, shared_link__isnull=True) |
                    models.Q(scene__isnull=True, element__isnull=False, shared_link__isnull=True) |
                    models.Q(scene__isnull=True, element__isnull=True, shared_link__isnull=False)
                ),
                name='comment_single_target'
            )
        ]

    def __str__(self):
        if self.element_id:
            target = f"element {self.element_id}"
        elif self.scene_id:
            target = f"scene {self.scene_id}"
        else:
            target = f"shared_link {self.shared_link_id}"
        return f"Comment by {self.author_name} on {target}"

    def clean(self):
        super().clean()
        if self.parent:
            if self.parent.element_id != self.element_id or self.parent.scene_id != self.scene_id or self.parent.shared_link_id != self.shared_link_id:
                from django.core.exceptions import ValidationError
                raise ValidationError('Reply must target the same element/scene/link as parent.')


class ElementReaction(models.Model):
    class Value(models.TextChoices):
        LIKE = 'like', '👍'
        DISLIKE = 'dislike', '👎'

    element = models.ForeignKey(
        'elements.Element', on_delete=models.CASCADE, related_name='reactions'
    )
    session_id = models.CharField(max_length=36)
    author_name = models.CharField(max_length=100, default='')
    value = models.CharField(max_length=10, choices=Value.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['element', 'session_id']

    def __str__(self):
        return f"{self.value} on element {self.element_id} by {self.session_id}"


class ElementReview(models.Model):
    class Action(models.TextChoices):
        APPROVED = 'approved', 'Согласовано'
        CHANGES_REQUESTED = 'changes_requested', 'На доработку'
        REJECTED = 'rejected', 'Отклонено'

    element = models.ForeignKey(
        'elements.Element', on_delete=models.CASCADE, related_name='reviews'
    )
    session_id = models.CharField(max_length=36)
    author_name = models.CharField(max_length=100, default='')
    action = models.CharField(max_length=20, choices=Action.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['element', 'session_id']

    def __str__(self):
        return f"{self.action} on element {self.element_id} by {self.author_name or self.session_id}"
