from django.db import models


class Element(models.Model):
    """Модель элемента (изображение или видео)."""
    
    # Типы элементов
    ELEMENT_TYPE_IMAGE = 'IMAGE'
    ELEMENT_TYPE_VIDEO = 'VIDEO'
    
    ELEMENT_TYPE_CHOICES = [
        (ELEMENT_TYPE_IMAGE, 'Изображение'),
        (ELEMENT_TYPE_VIDEO, 'Видео'),
    ]
    
    # Статусы генерации
    STATUS_PENDING = 'PENDING'
    STATUS_PROCESSING = 'PROCESSING'
    STATUS_COMPLETED = 'COMPLETED'
    STATUS_FAILED = 'FAILED'
    STATUS_UPLOADING = 'UPLOADING'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Ожидание'),
        (STATUS_PROCESSING, 'Обработка'),
        (STATUS_COMPLETED, 'Завершено'),
        (STATUS_FAILED, 'Ошибка'),
        (STATUS_UPLOADING, 'Загрузка'),
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
    
    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        related_name='elements',
        verbose_name='Проект'
    )
    scene = models.ForeignKey(
        'scenes.Scene',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='elements',
        verbose_name='Группа'
    )
    element_type = models.CharField(
        max_length=10,
        choices=ELEMENT_TYPE_CHOICES,
        verbose_name='Тип элемента'
    )
    order_index = models.IntegerField(
        default=0,
        verbose_name='Порядковый номер',
        help_text='Порядок отображения элемента внутри группы'
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
    preview_url = models.URLField(max_length=500, blank=True, default='')
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
        related_name='generated_elements',
        verbose_name='AI Модель',
        help_text='Модель, которая сгенерировала этот элемент'
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
        help_text='Статус генерации элемента'
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
        help_text='Способ создания элемента'
    )
    external_task_id = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='ID задачи у провайдера',
        help_text='Task ID от Kie.ai или другого провайдера',
        db_index=True
    )
    file_size = models.BigIntegerField(
        null=True,
        blank=True,
        verbose_name='Размер файла (байт)',
    )
    upload_keys = models.JSONField(null=True, blank=True, help_text='S3 keys for presigned upload: {original, small, medium}')

    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата создания'
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='Дата обновления'
    )

    class Meta:
        verbose_name = 'Элемент'
        verbose_name_plural = 'Элементы'
        ordering = ['order_index', 'created_at']

    def __str__(self) -> str:
        group_name = self.scene.name if self.scene else "Root"
        return f"{self.element_type} - {group_name} - {self.id}"
