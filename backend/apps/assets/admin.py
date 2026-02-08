from django.contrib import admin
from .models import Asset


@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    """Админка для модели Asset."""
    list_display = ('id', 'box', 'asset_type', 'ai_model', 'is_favorite', 'created_at')
    list_filter = ('asset_type', 'is_favorite', 'box__project', 'ai_model')
    search_fields = ('prompt_text',)
    list_editable = ('is_favorite',)
    readonly_fields = ('created_at', 'updated_at')
    ordering = ('-created_at',)
    
    fieldsets = (
        ('Основная информация', {
            'fields': ('box', 'asset_type', 'is_favorite')
        }),
        ('Файлы', {
            'fields': ('file_url', 'thumbnail_url')
        }),
        ('Промпт', {
            'fields': ('prompt_text',),
            'classes': ('collapse',)
        }),
        ('AI Генерация', {
            'fields': ('ai_model', 'generation_config', 'seed'),
            'description': 'Параметры генерации через AI'
        }),
        ('Временные метки', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
