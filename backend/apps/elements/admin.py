from django.contrib import admin
from .models import Element


@admin.register(Element)
class ElementAdmin(admin.ModelAdmin):
    """Админка для модели Element."""
    list_display = ('id', 'scene', 'element_type', 'ai_model', 'is_favorite', 'created_at')
    list_filter = ('element_type', 'is_favorite', 'scene__project', 'ai_model')
    search_fields = ('prompt_text',)
    list_editable = ('is_favorite',)
    readonly_fields = ('created_at', 'updated_at')
    ordering = ('-created_at',)
    
    fieldsets = (
        ('Основная информация', {
            'fields': ('scene', 'element_type', 'is_favorite')
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
