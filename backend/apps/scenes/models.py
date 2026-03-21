from django.core.exceptions import ValidationError
from django.db import models


class Scene(models.Model):
    """Модель сцены."""
    
    # Статусы сцены
    STATUS_DRAFT = 'DRAFT'
    STATUS_IN_PROGRESS = 'IN_PROGRESS'
    STATUS_REVIEW = 'REVIEW'
    STATUS_APPROVED = 'APPROVED'
    
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Черновик'),
        (STATUS_IN_PROGRESS, 'В работе'),
        (STATUS_REVIEW, 'На проверке'),
        (STATUS_APPROVED, 'Утверждён'),
    ]
    
    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        related_name='scenes',
        verbose_name='Проект'
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children',
        verbose_name='Родительская группа'
    )
    name = models.CharField(
        max_length=255,
        verbose_name='Название'
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_DRAFT,
        verbose_name='Статус',
        help_text='Статус сцены'
    )
    order_index = models.IntegerField(
        default=0,
        verbose_name='Порядковый номер'
    )
    headliner = models.ForeignKey(
        'elements.Element',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='headliner_for_scene',
        verbose_name='Лучший элемент',
        help_text='Главный элемент — обложка сцены на сценарном столе'
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
        ordering = ['order_index', 'created_at']
        verbose_name = 'Группа'
        verbose_name_plural = 'Группы'

    def clean(self):
        super().clean()
        if self.parent is not None and self.parent.parent is not None:
            raise ValidationError(
                'Максимальная вложенность — 2 уровня. '
                'Нельзя поместить группу внутрь подгруппы.'
            )

    def __str__(self) -> str:
        return f'{self.name} (Проект: {self.project.name})'
