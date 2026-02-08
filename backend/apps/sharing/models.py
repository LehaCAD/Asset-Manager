import uuid
from django.db import models


class SharedLink(models.Model):
    """Публичная ссылка на проект для просмотра без авторизации."""
    
    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        related_name='shared_links',
        verbose_name='Проект'
    )
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
    """Комментарий к боксу от клиента через публичную ссылку."""
    
    box = models.ForeignKey(
        'boxes.Box',
        on_delete=models.CASCADE,
        related_name='comments',
        verbose_name='Бокс'
    )
    author_name = models.CharField(
        max_length=100,
        verbose_name='Имя автора',
        help_text='Имя клиента, оставившего комментарий'
    )
    text = models.TextField(
        verbose_name='Текст комментария'
    )
    is_read = models.BooleanField(
        default=False,
        verbose_name='Прочитано',
        help_text='Отметка о прочтении комментария'
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
        verbose_name = 'Комментарий'
        verbose_name_plural = 'Комментарии'
        ordering = ['-created_at']

    def __str__(self) -> str:
        preview = self.text[:50] + '...' if len(self.text) > 50 else self.text
        status = '✓' if self.is_read else '✗'
        return f'{status} {self.author_name}: {preview}'
