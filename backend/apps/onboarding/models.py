from django.conf import settings
from django.db import models


class OnboardingTask(models.Model):
    CATEGORY_CHOICES = [
        ('onboarding', 'Первые шаги'),
        ('feature', 'Возможности'),
        ('milestone', 'Достижения'),
    ]
    TRIGGER_TYPE_CHOICES = [
        ('backend_signal', 'Авто (бэкенд)'),
        ('frontend_action', 'По действию (фронт)'),
    ]

    code = models.CharField(max_length=60, unique=True)
    title = models.CharField('Название', max_length=120)
    description = models.CharField('Описание', max_length=200)
    icon = models.CharField('Иконка (Lucide)', max_length=50, default='circle-dot')
    reward = models.DecimalField('Награда (кадров)', max_digits=10, decimal_places=2, default=0)
    order = models.PositiveIntegerField('Порядок', default=0)
    is_active = models.BooleanField('Активно', default=True)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='onboarding')
    trigger_type = models.CharField(max_length=20, choices=TRIGGER_TYPE_CHOICES, default='backend_signal')
    trigger_event = models.CharField(max_length=100, blank=True, default='')

    empty_state_title = models.CharField('Заголовок пустого экрана', max_length=120, blank=True, default='')
    empty_state_desc = models.CharField('Описание пустого экрана', max_length=200, blank=True, default='')
    empty_state_cta = models.CharField('Кнопка пустого экрана', max_length=60, blank=True, default='')
    empty_state_page = models.CharField('Страница', max_length=20, blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order']
        verbose_name = 'Задание'
        verbose_name_plural = 'Задания'

    def __str__(self):
        return f'{self.order}. {self.title}'


class UserOnboardingState(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='onboarding_state',
    )
    welcome_seen = models.BooleanField(default=False)
    backfill_done = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Состояние онбординга'
        verbose_name_plural = 'Состояния онбординга'


class UserTaskCompletion(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='task_completions',
    )
    task = models.ForeignKey(
        OnboardingTask,
        on_delete=models.CASCADE,
        related_name='completions',
    )
    completed_at = models.DateTimeField(auto_now_add=True)
    reward_paid = models.BooleanField(default=False)

    class Meta:
        unique_together = ('user', 'task')
        verbose_name = 'Выполнение задания'
        verbose_name_plural = 'Выполнения заданий'
