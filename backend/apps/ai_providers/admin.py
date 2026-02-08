from django.contrib import admin
from django.utils.html import format_html
from .models import AIProvider, AIModel


@admin.register(AIProvider)
class AIProviderAdmin(admin.ModelAdmin):
    """Админка для модели AIProvider."""
    list_display = ('name', 'base_url_display', 'is_active', 'models_count', 'created_at')
    list_filter = ('is_active', 'created_at')
    search_fields = ('name', 'base_url')
    list_editable = ('is_active',)
    readonly_fields = ('created_at', 'updated_at')
    ordering = ('name',)
    
    fieldsets = (
        ('Основная информация', {
            'fields': ('name', 'base_url', 'api_key', 'is_active')
        }),
        ('Временные метки', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def base_url_display(self, obj):
        """Укороченное отображение URL."""
        if len(obj.base_url) > 40:
            return obj.base_url[:40] + '...'
        return obj.base_url
    base_url_display.short_description = 'Base URL'
    
    def models_count(self, obj):
        """Количество моделей провайдера."""
        count = obj.models.count()
        active_count = obj.models.filter(is_active=True).count()
        return format_html('<b>{}</b> / {}', active_count, count)
    models_count.short_description = 'Модели (активных/всего)'


@admin.register(AIModel)
class AIModelAdmin(admin.ModelAdmin):
    """Админка для модели AIModel."""
    list_display = ('name', 'provider', 'model_type', 'is_active', 'api_endpoint_display', 'created_at')
    list_filter = ('model_type', 'is_active', 'provider')
    search_fields = ('name', 'api_endpoint')
    list_editable = ('is_active',)
    readonly_fields = ('created_at', 'updated_at', 'full_url_display')
    ordering = ('provider', 'name')
    
    fieldsets = (
        ('Основная информация', {
            'fields': ('provider', 'name', 'model_type', 'is_active')
        }),
        ('API конфигурация', {
            'fields': ('api_endpoint', 'full_url_display'),
            'description': 'Настройки эндпоинта для API запросов'
        }),
        ('Схема запроса', {
            'fields': ('request_schema',),
            'description': 'JSON структура запроса с плейсхолдерами {{variable}}'
        }),
        ('Схема параметров для UI', {
            'fields': ('parameters_schema',),
            'description': 'JSON описание параметров: типы, опции, дефолты'
        }),
        ('Временные метки', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def api_endpoint_display(self, obj):
        """Укороченное отображение эндпоинта."""
        if len(obj.api_endpoint) > 30:
            return obj.api_endpoint[:30] + '...'
        return obj.api_endpoint
    api_endpoint_display.short_description = 'Эндпоинт'
    
    def full_url_display(self, obj):
        """Полный URL для копирования."""
        url = obj.get_full_url()
        return format_html('<code style="background:#f0f0f0;padding:5px;display:block;">{}</code>', url)
    full_url_display.short_description = 'Полный URL (для справки)'
