from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver


class User(AbstractUser):
    """Кастомная модель пользователя."""
    # Можешь добавить свои поля позже
    # phone = models.CharField(max_length=20, blank=True)
    # avatar = models.ImageField(upload_to='avatars/', blank=True)
    
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
    max_boxes_per_project = models.IntegerField(
        default=20,
        verbose_name='Максимум сцен на проект',
        help_text='Максимальное количество сцен в одном проекте'
    )
    max_assets_per_box = models.IntegerField(
        default=10,
        verbose_name='Максимум элементов на сцену',
        help_text='Максимальное количество элементов в одной сцене'
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
        return f'Квота: {self.user.username} (Проекты: {self.max_projects}, Сцены: {self.max_boxes_per_project}, Элементы: {self.max_assets_per_box})'


@receiver(post_save, sender=User)
def create_user_quota(sender, instance, created, **kwargs):
    """Автоматически создаём UserQuota при создании нового пользователя."""
    if created:
        UserQuota.objects.create(user=instance)
