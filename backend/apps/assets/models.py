from django.db import models


class Asset(models.Model):
    """Модель ассета (изображение или видео)."""
    
    # Типы ассетов
    ASSET_TYPE_IMAGE = 'IMAGE'
    ASSET_TYPE_VIDEO = 'VIDEO'
    
    ASSET_TYPE_CHOICES = [
        (ASSET_TYPE_IMAGE, 'Изображение'),
        (ASSET_TYPE_VIDEO, 'Видео'),
    ]
    
    # Статусы генерации
    STATUS_PENDING = 'PENDING'
    STATUS_PROCESSING = 'PROCESSING'
    STATUS_COMPLETED = 'COMPLETED'
    STATUS_FAILED = 'FAILED'
    
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Ожидание'),
        (STATUS_PROCESSING, 'Обработка'),
        (STATUS_COMPLETED, 'Завершено'),
        (STATUS_FAILED, 'Ошибка'),
    ]
    
    # Типы источников
    SOURCE_GENERATED = 'GENERATED'
    SOURCE_UPLOADED = 'UPLOADED'
    SOURCE_IMG2VID = 'IMG2VID'
    
    SOURCE_TYPE_CHOICES = [
        (SOURCE_GENERATED, 'Сгенерировано AI'),
        (SOURCE_UPLOADED, 'Загружено пользователем'),
        (SOURCE_IMG2VID, 'Img2Vid преобразование'),
    ]
    
    box = models.ForeignKey(
        'boxes.Box',
        on_delete=models.CASCADE,
        related_name='assets',
        verbose_name='Бокс'
    )
    asset_type = models.CharField(
        max_length=10,
        choices=ASSET_TYPE_CHOICES,
        verbose_name='Тип ассета'
    )
    file_url = models.URLField(
        max_length=500,
        blank=True,
        verbose_name='URL файла'
    )
    thumbnail_url = models.URLField(
        max_length=500,
        blank=True,
        verbose_name='URL превью'
    )
    is_favorite = models.BooleanField(
        default=False,
        verbose_name='Избранное'
    )
    prompt_text = models.TextField(
        blank=True,
        verbose_name='Текст промпта'
    )
    
    # AI Generation fields
    ai_model = models.ForeignKey(
        'ai_providers.AIModel',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='generated_assets',
        verbose_name='AI Модель',
        help_text='Модель, которая сгенерировала этот ассет'
    )
    generation_config = models.JSONField(
        default=dict,
        blank=True,
        verbose_name='Конфигурация генерации',
        help_text='Выбранные параметры генерации (width, height, steps, и т.д.)'
    )
    seed = models.IntegerField(
        null=True,
        blank=True,
        verbose_name='Seed',
        help_text='Seed для воспроизводимости генерации'
    )
    
    # Generation status and tracking
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        verbose_name='Статус',
        help_text='Статус генерации ассета'
    )
    error_message = models.TextField(
        blank=True,
        verbose_name='Сообщение об ошибке',
        help_text='Детали ошибки при генерации'
    )
    source_type = models.CharField(
        max_length=20,
        choices=SOURCE_TYPE_CHOICES,
        default=SOURCE_GENERATED,
        verbose_name='Тип источника',
        help_text='Способ создания ассета'
    )
    parent_asset = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='child_assets',
        verbose_name='Родительский ассет',
        help_text='Исходный ассет для img2vid или вариаций'
    )
    external_task_id = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='ID задачи у провайдера',
        help_text='Task ID от Kie.ai или другого провайдера',
        db_index=True
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
        verbose_name = 'Ассет'
        verbose_name_plural = 'Ассеты'
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.get_asset_type_display()} #{self.id} (Бокс: {self.box.name})'
