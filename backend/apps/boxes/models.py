from django.db import models


class Box(models.Model):
    """Модель бокса (шота)."""
    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        related_name='boxes',
        verbose_name='Проект'
    )
    name = models.CharField(
        max_length=255,
        verbose_name='Название'
    )
    order_index = models.IntegerField(
        default=0,
        verbose_name='Порядковый номер'
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
        verbose_name = 'Бокс (Шот)'
        verbose_name_plural = 'Боксы (Шоты)'
        ordering = ['order_index', 'created_at']

    def __str__(self) -> str:
        return f'{self.name} (Проект: {self.project.name})'
