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


@receiver(post_save, sender=User)
def create_user_subscription(sender, instance, created, **kwargs):
    """Автоматически создаём триальную подписку при создании нового пользователя."""
    if created:
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
