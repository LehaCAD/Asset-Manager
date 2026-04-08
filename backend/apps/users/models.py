from decimal import Decimal
import uuid
from datetime import timedelta

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone


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
    is_email_verified = models.BooleanField(default=False, verbose_name='Email подтверждён')
    email_verification_token = models.UUIDField(default=uuid.uuid4, editable=False)
    email_verification_sent_at = models.DateTimeField(null=True, blank=True)
    password_reset_token = models.UUIDField(null=True, blank=True)
    password_reset_sent_at = models.DateTimeField(null=True, blank=True)
    tos_accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Пользователь'
        verbose_name_plural = 'Пользователи'

    def __str__(self):
        return self.username

    def is_password_reset_token_valid(self):
        """Токен сброса пароля валиден 1 час."""
        if not self.password_reset_token or not self.password_reset_sent_at:
            return False
        return timezone.now() - self.password_reset_sent_at < timedelta(hours=1)

    def can_resend_verification(self):
        """Можно отправлять повторно раз в 60 секунд."""
        if not self.email_verification_sent_at:
            return True
        return timezone.now() - self.email_verification_sent_at > timedelta(seconds=60)


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
    """Автоматически создаём UserQuota и триальную подписку при создании нового пользователя."""
    if created:
        UserQuota.objects.create(user=instance)
        # Create trial subscription
        from apps.subscriptions.models import Plan, Subscription
        from apps.credits.services import CreditsService
        default_plan = Plan.objects.filter(is_default=True).first()
        if default_plan:
            Subscription.objects.create(
                user=instance,
                plan=default_plan,
                status='trial',
                expires_at=timezone.now() + timedelta(days=7),
            )
            CreditsService().topup(
                instance,
                Decimal('50'),
                reason='trial_bonus',
                metadata={'source': 'registration_trial'},
            )
