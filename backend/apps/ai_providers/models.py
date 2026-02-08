from django.db import models


class AIProvider(models.Model):
    """Провайдер AI (например, Kie.ai, OpenAI)."""
    
    name = models.CharField(
        max_length=100,
        verbose_name='Название провайдера'
    )
    base_url = models.URLField(
        max_length=500,
        verbose_name='Базовый URL API',
        help_text='Базовый URL API, например https://api.kie.ai'
    )
    api_key = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='API ключ',
        help_text='API ключ для авторизации (опционально)'
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name='Активен',
        help_text='Использовать ли этот провайдер'
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
        verbose_name = 'AI Провайдер'
        verbose_name_plural = 'AI Провайдеры'
        ordering = ['name']

    def __str__(self) -> str:
        status = '✓' if self.is_active else '✗'
        return f'{status} {self.name}'


class AIModel(models.Model):
    """Модель AI для генерации изображений или видео."""
    
    # Типы моделей
    MODEL_TYPE_IMAGE = 'IMAGE'
    MODEL_TYPE_VIDEO = 'VIDEO'
    
    MODEL_TYPE_CHOICES = [
        (MODEL_TYPE_IMAGE, 'Изображение'),
        (MODEL_TYPE_VIDEO, 'Видео'),
    ]
    
    provider = models.ForeignKey(
        AIProvider,
        on_delete=models.CASCADE,
        related_name='models',
        verbose_name='Провайдер'
    )
    name = models.CharField(
        max_length=100,
        verbose_name='Название модели',
        help_text='Например: Nano Banana, Seedance 1.5 Pro'
    )
    model_type = models.CharField(
        max_length=10,
        choices=MODEL_TYPE_CHOICES,
        verbose_name='Тип модели'
    )
    api_endpoint = models.CharField(
        max_length=255,
        verbose_name='Путь эндпоинта',
        help_text='Путь эндпоинта, например /v1/generate или /nano-banana'
    )
    request_schema = models.JSONField(
        default=dict,
        blank=True,
        verbose_name='Схема запроса',
        help_text='Полная структура запроса с плейсхолдерами {{variable}}, например: {"prompt": "{{prompt}}", "width": {{width}}}'
    )
    parameters_schema = models.JSONField(
        default=dict,
        blank=True,
        verbose_name='Схема параметров',
        help_text='Описание параметров для UI: типы, опции, дефолты. Например: {"width": {"type": "select", "options": [512, 1024], "default": 1024}}'
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name='Активна',
        help_text='Использовать ли эту модель'
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
        verbose_name = 'AI Модель'
        verbose_name_plural = 'AI Модели'
        ordering = ['provider', 'name']

    def __str__(self) -> str:
        status = '✓' if self.is_active else '✗'
        return f'{status} {self.name} ({self.get_model_type_display()}) - {self.provider.name}'
    
    def get_full_url(self) -> str:
        """Получить полный URL эндпоинта."""
        base = self.provider.base_url.rstrip('/')
        endpoint = self.api_endpoint.lstrip('/')
        return f'{base}/{endpoint}'
