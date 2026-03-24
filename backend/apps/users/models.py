from decimal import Decimal

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver


class User(AbstractUser):
    """Кастомная модель пользователя."""
    # Можешь добавить свои поля позже
    # phone = models.CharField(max_length=20, blank=True)
    # avatar = models.ImageField(upload_to='avatars/', blank=True)
    
    balance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        verbose_name="Баланс"
    )
    pricing_percent = models.PositiveIntegerField(
        default=100,
        verbose_name="Процент цены",
        help_text="100 = по себестоимости, 80 = скидка 20%, 130 = наценка 30%"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Пользователь'
        verbose_name_plural = 'Пользователи'

    def __str__(self):
        return self.username


class UserQuota(models.Model):
    """Модель квот пользователя."""
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='quota',
        verbose_name='Пользователь'
    )
    max_projects = models.IntegerField(
        default=5,
        verbose_name='Максимум проектов',
        help_text='Максимальное количество проектов пользователя'
    )
    max_scenes_per_project = models.IntegerField(
        default=20,
        verbose_name='Макс. групп в проекте',
        help_text='Максимальное количество групп в одном проекте'
    )
    max_elements_per_scene = models.IntegerField(
        default=10,
        verbose_name='Макс. элементов в группе',
        help_text='Максимальное количество элементов в одной группе'
    )
    storage_limit_bytes = models.BigIntegerField(
        default=300 * 1024 * 1024,  # 300 MB
        verbose_name='Лимит хранилища (байт)',
        help_text='Максимальный объём файлов в S3. По умолчанию 300 МБ.'
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
        verbose_name = 'Квота пользователя'
        verbose_name_plural = 'Квоты пользователей'

    def __str__(self) -> str:
        return f'Квота: {self.user.username} (Проекты: {self.max_projects}, Группы: {self.max_scenes_per_project}, Элементы: {self.max_elements_per_scene})'


@receiver(post_save, sender=User)
def create_user_quota(sender, instance, created, **kwargs):
    """Автоматически создаём UserQuota при создании нового пользователя."""
    if created:
        UserQuota.objects.create(user=instance)
