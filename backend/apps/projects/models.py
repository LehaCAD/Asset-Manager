from django.db import models
from django.conf import settings


class Project(models.Model):
    """Модель проекта."""
    
    # Статусы проекта
    STATUS_ACTIVE = 'ACTIVE'
    STATUS_PAUSED = 'PAUSED'
    STATUS_COMPLETED = 'COMPLETED'
    
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'В работе'),
        (STATUS_PAUSED, 'На паузе'),
        (STATUS_COMPLETED, 'Завершён'),
    ]
    
    # Форматы кадров
    ASPECT_RATIO_16_9 = '16:9'
    ASPECT_RATIO_9_16 = '9:16'
    
    ASPECT_RATIO_CHOICES = [
        (ASPECT_RATIO_16_9, 'Горизонтальный'),
        (ASPECT_RATIO_9_16, 'Вертикальный'),
    ]
    
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='projects',
        verbose_name='Пользователь'
    )
    name = models.CharField(
        max_length=255,
        verbose_name='Название'
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE,
        verbose_name='Статус',
        help_text='Статус проекта'
    )
    aspect_ratio = models.CharField(
        max_length=10,
        choices=ASPECT_RATIO_CHOICES,
        default=ASPECT_RATIO_16_9,
        verbose_name='Формат кадра',
        help_text='Соотношение сторон кадров в проекте'
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
        verbose_name = 'Проект'
        verbose_name_plural = 'Проекты'
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.name} ({self.user.username})'
