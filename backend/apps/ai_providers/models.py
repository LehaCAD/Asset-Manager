from django.core.exceptions import ValidationError
from django.db import models


# Module-level constants (before any model class)
MODEL_TYPE_IMAGE = 'IMAGE'
MODEL_TYPE_VIDEO = 'VIDEO'
MODEL_TYPE_CHOICES = [
    (MODEL_TYPE_IMAGE, 'Изображение'),
    (MODEL_TYPE_VIDEO, 'Видео'),
]


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
        verbose_name = 'AI провайдер'
        verbose_name_plural = 'AI провайдеры'
        ordering = ['name']

    def __str__(self) -> str:
        status = '✓' if self.is_active else '✗'
        return f'{status} {self.name}'


class ModelFamily(models.Model):
    """Семейство вариантов AI-модели (например, Veo 3.1 Fast/Quality)."""

    VARIANT_UI_PILLS = 'pills'
    VARIANT_UI_SELECT = 'select'
    VARIANT_UI_CHOICES = [
        (VARIANT_UI_PILLS, 'Кнопки (pills)'),
        (VARIANT_UI_SELECT, 'Выпадающий список (select)'),
    ]

    name = models.CharField(
        max_length=100,
        verbose_name='Название семейства',
        help_text='Например: Veo 3.1, Flux 2, Kling'
    )
    model_type = models.CharField(
        max_length=10,
        choices=MODEL_TYPE_CHOICES,
        verbose_name='Тип модели'
    )
    preview_url = models.CharField(
        max_length=500,
        blank=True,
        verbose_name='URL превью',
        help_text='Превью-картинка для карточки семейства в пикере'
    )
    description = models.TextField(
        blank=True,
        verbose_name='Описание',
        help_text='Описание семейства для пикера'
    )
    tags = models.JSONField(
        default=list,
        blank=True,
        verbose_name='Теги',
        help_text='Бейджи для карточки семейства'
    )
    variant_ui_control = models.CharField(
        max_length=20,
        choices=VARIANT_UI_CHOICES,
        default=VARIANT_UI_PILLS,
        verbose_name='Тип переключателя вариантов',
        help_text='Как пользователь переключает варианты: кнопки или выпадающий список'
    )
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name='Порядок сортировки'
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name='Активно',
        help_text='Если выключено — все варианты семейства скрыты'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Дата обновления')

    class Meta:
        verbose_name = 'Семейство моделей'
        verbose_name_plural = 'Семейства моделей'
        ordering = ['sort_order', 'name']

    def __str__(self) -> str:
        status = '✓' if self.is_active else '✗'
        return f'{status} {self.name} ({self.get_model_type_display()})'


class AIModel(models.Model):
    """Модель AI для генерации изображений или видео."""

    # Типы моделей (алиасы на модульные константы для обратной совместимости)
    MODEL_TYPE_IMAGE = MODEL_TYPE_IMAGE
    MODEL_TYPE_VIDEO = MODEL_TYPE_VIDEO

    MODEL_TYPE_CHOICES = MODEL_TYPE_CHOICES
    
    PARAMETERS_SCHEMA_SOURCE_EMPTY = 'empty'
    PARAMETERS_SCHEMA_SOURCE_LEGACY = 'legacy'
    PARAMETERS_SCHEMA_SOURCE_COMPILED = 'compiled'

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
    status_check_endpoint = models.CharField(
        max_length=255,
        blank=True,
        default='',
        verbose_name='Эндпоинт проверки статуса',
        help_text='Путь для polling статуса. Пусто = /api/v1/jobs/recordInfo (стандарт Kie.ai). '
                  'Для VEO: /api/v1/veo/record-info'
    )
    response_mapping = models.JSONField(
        default=dict,
        blank=True,
        verbose_name='Маппинг ответа API',
        help_text=(
            'Как парсить ответ провайдера. Пусто = стандарт Kie.ai.\n'
            'Поля: state_path, success_value, failed_values, result_url_path, error_path.\n'
            'Пример VEO: {"state_path": "data.successFlag", "success_value": 1, '
            '"failed_values": [2, 3], "result_url_path": "data.response.resultUrls.0", '
            '"error_path": "data.errorMessage"}'
        ),
    )
    request_schema = models.JSONField(
        default=dict,
        blank=True,
        verbose_name='Схема запроса',
        help_text='Полная структура запроса с плейсхолдерами {{variable}}, например: {"prompt": "{{prompt}}", "width": {{width}}}'
    )
    parameters_schema = models.JSONField(
        default=list,
        blank=True,
        verbose_name='Схема параметров',
        help_text='Описание параметров для UI в виде списка: [{"key": "aspect_ratio", "label": "Соотношение сторон", "type": "toggle_group", "options": [...], "default": "1:1"}]'
    )
    preview_url = models.CharField(
        max_length=500,
        blank=True,
        verbose_name='URL превью',
        help_text='URL или путь к превью-картинке, например: /images/models/veo_3_1_fast.png или https://...'
    )
    description = models.TextField(
        blank=True,
        verbose_name='Описание',
        help_text='Краткое описание модели для UI, например: "Высокое качество и детализация"'
    )
    tags = models.JSONField(
        default=list,
        blank=True,
        verbose_name='Теги',
        help_text='Теги-бейджи для карточки модели, например: ["Style Ref", "Content Ref", "Image Ref"]'
    )
    family = models.ForeignKey(
        ModelFamily,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='variants',
        verbose_name='Семейство',
        help_text='Принадлежность к семейству. Пусто = standalone модель.'
    )
    variant_label = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Название варианта',
        help_text='Короткое название: Fast, Quality, Pro, v2'
    )
    variant_sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name='Порядок варианта',
        help_text='Порядок в переключателе вариантов'
    )
    is_default_variant = models.BooleanField(
        default=False,
        verbose_name='Вариант по умолчанию',
        help_text='Какой вариант выбирается при клике на семейство в пикере'
    )
    image_inputs_schema = models.JSONField(
        default=list,
        blank=True,
        verbose_name='Схема входных изображений',
        help_text=(
            'Два формата:\n'
            '1) Список слотов: [{"key": "input_urls", "label": "...", "min": 0, "max": 4}]\n'
            '2) Группы: {"mode": "groups", "no_images_params": {...}, "groups": [{...}]}'
        ),
    )
    pricing_schema = models.JSONField(
        default=dict,
        blank=False,
        verbose_name="Схема ценообразования",
        help_text='Либо {"fixed_cost": "5.00"}, либо {"cost_params": ["resolution", "duration"], "costs": {"720p|5": "3.00"}}'
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
        verbose_name = 'AI модель'
        verbose_name_plural = 'AI модели'
        ordering = ['provider', 'name']

    def __str__(self) -> str:
        status = '✓' if self.is_active else '✗'
        return f'{status} {self.name} ({self.get_model_type_display()}) - {self.provider.name}'
    
    def get_full_url(self) -> str:
        """Получить полный URL эндпоинта."""
        base = self.provider.base_url.rstrip('/')
        endpoint = self.api_endpoint.lstrip('/')
        return f'{base}/{endpoint}'

    def get_parameters_schema_source(self) -> str:
        """
        Dict payloads remain the legacy authoring format.
        List payloads are treated as compiled runtime artifacts for compatibility.
        """
        if isinstance(self.parameters_schema, list):
            return self.PARAMETERS_SCHEMA_SOURCE_COMPILED
        if isinstance(self.parameters_schema, dict) and self.parameters_schema:
            return self.PARAMETERS_SCHEMA_SOURCE_LEGACY
        return self.PARAMETERS_SCHEMA_SOURCE_EMPTY

    def has_legacy_parameters_schema(self) -> bool:
        return self.get_parameters_schema_source() == self.PARAMETERS_SCHEMA_SOURCE_LEGACY

    def has_compiled_parameters_schema(self) -> bool:
        return self.get_parameters_schema_source() == self.PARAMETERS_SCHEMA_SOURCE_COMPILED

    def get_runtime_parameters_schema(self):
        if self.parameter_bindings.exists():
            from .compiler import compile_parameters_schema

            return compile_parameters_schema(self)
        return self.parameters_schema

    def get_runtime_pricing_schema(self):
        if hasattr(self, 'pricing_config'):
            from .compiler import compile_pricing_payload

            return compile_pricing_payload(self)
        return self.pricing_schema

    def clean(self):
        super().clean()

        if self.family:
            if self.family.model_type != self.model_type:
                raise ValidationError({
                    'family': f'Тип модели ({self.get_model_type_display()}) не совпадает '
                              f'с типом семейства ({self.family.get_model_type_display()}).'
                })
            if not self.variant_label:
                raise ValidationError({
                    'variant_label': 'Название варианта обязательно для модели в семействе.'
                })
            if self.is_default_variant:
                existing = type(self).objects.filter(
                    family=self.family, is_default_variant=True
                ).exclude(pk=self.pk)
                if existing.exists():
                    raise ValidationError({
                        'is_default_variant': f'В семействе уже есть вариант по умолчанию: {existing.first().name}'
                    })
        else:
            if self.variant_label:
                raise ValidationError({
                    'variant_label': 'Название варианта должно быть пусто для standalone модели.'
                })


class CanonicalParameter(models.Model):
    VALUE_TYPE_STRING = 'string'
    VALUE_TYPE_ENUM = 'enum'
    VALUE_TYPE_INTEGER = 'integer'
    VALUE_TYPE_DECIMAL = 'decimal'
    VALUE_TYPE_BOOLEAN = 'boolean'

    VALUE_TYPE_CHOICES = [
        (VALUE_TYPE_STRING, 'String'),
        (VALUE_TYPE_ENUM, 'Enum'),
        (VALUE_TYPE_INTEGER, 'Integer'),
        (VALUE_TYPE_DECIMAL, 'Decimal'),
        (VALUE_TYPE_BOOLEAN, 'Boolean'),
    ]

    code = models.CharField(max_length=100, unique=True)
    ui_semantic = models.CharField(max_length=100)
    value_type = models.CharField(max_length=20, choices=VALUE_TYPE_CHOICES)
    default_ui_control = models.CharField(max_length=100, blank=True, default='')
    aliases = models.JSONField(default=list, blank=True)
    base_options = models.JSONField(default=list, blank=True)
    config = models.JSONField(default=dict, blank=True)
    can_participate_in_pricing = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['code']

    def __str__(self) -> str:
        return self.code


class ModelParameterBinding(models.Model):
    ai_model = models.ForeignKey(
        AIModel,
        on_delete=models.CASCADE,
        related_name='parameter_bindings',
    )
    canonical_parameter = models.ForeignKey(
        CanonicalParameter,
        on_delete=models.CASCADE,
        related_name='model_bindings',
    )
    placeholder = models.CharField(max_length=100)
    request_path = models.CharField(max_length=255, blank=True, default='')
    label_override = models.CharField(max_length=255, blank=True, default='')
    default_override = models.JSONField(default=dict, blank=True)
    options_override = models.JSONField(default=list, blank=True)
    ui_control_override = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text='Override control for this model (select, toggle_group, etc). Empty = use canonical default.',
    )
    is_visible = models.BooleanField(default=True)
    is_advanced = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'id']
        unique_together = [
            ('ai_model', 'placeholder'),
            ('ai_model', 'canonical_parameter'),
        ]

    def __str__(self) -> str:
        return f'{self.ai_model_id}:{self.placeholder}'


class ModelPricingConfig(models.Model):
    MODE_FIXED = 'fixed'
    MODE_LOOKUP = 'lookup'

    MODE_CHOICES = [
        (MODE_FIXED, 'Fixed'),
        (MODE_LOOKUP, 'Lookup'),
    ]

    ai_model = models.OneToOneField(
        AIModel,
        on_delete=models.CASCADE,
        related_name='pricing_config',
    )
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default=MODE_FIXED)
    dimensions = models.JSONField(default=list, blank=True)
    raw_lookup = models.JSONField(default=dict, blank=True)
    compiled_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f'{self.ai_model_id}:{self.mode}'
