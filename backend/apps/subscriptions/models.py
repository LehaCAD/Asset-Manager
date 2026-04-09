from django.conf import settings
from django.db import models
from django.utils import timezone


class Feature(models.Model):
    """Фича, доступная в тарифном плане."""

    code = models.CharField(max_length=50, unique=True)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    icon = models.CharField(max_length=50, blank=True, default='')
    min_plan = models.ForeignKey(
        'Plan',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='min_plan_features',
    )

    class Meta:
        ordering = ['code']
        verbose_name = 'Фича'
        verbose_name_plural = 'Фичи'

    def __str__(self):
        return self.title


class Plan(models.Model):
    """Тарифный план."""

    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=200)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    credits_per_month = models.IntegerField(default=0)
    max_projects = models.IntegerField(default=1, help_text='0 = безлимит')
    max_scenes_per_project = models.IntegerField(default=10)
    max_elements_per_scene = models.IntegerField(default=10)
    storage_limit_gb = models.IntegerField(default=1)
    features = models.ManyToManyField(Feature, blank=True, related_name='plans')
    is_default = models.BooleanField(default=False)
    is_recommended = models.BooleanField(default=False)
    is_trial_reference = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    display_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_order']
        verbose_name = 'Тарифный план'
        verbose_name_plural = 'Тарифные планы'

    def __str__(self):
        return self.name

    @property
    def storage_limit_bytes(self):
        if self.storage_limit_gb == 0:
            return 0
        return self.storage_limit_gb * 1024 ** 3

    def save(self, *args, **kwargs):
        if self.is_default:
            Plan.objects.filter(is_default=True).exclude(pk=self.pk).update(
                is_default=False
            )
        if self.is_trial_reference:
            Plan.objects.filter(is_trial_reference=True).exclude(pk=self.pk).update(
                is_trial_reference=False
            )
        super().save(*args, **kwargs)


class Subscription(models.Model):
    """Подписка пользователя на тарифный план."""

    STATUS_CHOICES = [
        ('active', 'Активна'),
        ('trial', 'Триал'),
        ('expired', 'Истекла'),
        ('cancelled', 'Отменена'),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='subscription',
    )
    plan = models.ForeignKey(
        Plan,
        on_delete=models.PROTECT,
        related_name='subscriptions',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='trial')
    started_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Подписка'
        verbose_name_plural = 'Подписки'

    def __str__(self):
        return f'{self.user} — {self.plan.name} ({self.get_status_display()})'

    @property
    def is_trial(self):
        return self.status == 'trial' and self.expires_at > timezone.now()

    @property
    def trial_days_left(self):
        if self.status != 'trial':
            return None
        delta = self.expires_at - timezone.now()
        days = delta.days
        return max(days, 0)
