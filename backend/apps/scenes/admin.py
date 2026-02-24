from django.contrib import admin
from .models import Scene


@admin.register(Scene)
class SceneAdmin(admin.ModelAdmin):
    """Админка для модели Scene."""
    list_display = ('name', 'project', 'order_index', 'created_at')
    list_filter = ('project', 'created_at')
    search_fields = ('name',)
    list_editable = ('order_index',)
    readonly_fields = ('created_at', 'updated_at')
    ordering = ('order_index', 'created_at')
    
    fieldsets = (
        ('Основная информация', {
            'fields': ('project', 'name', 'order_index')
        }),
        ('Временные метки', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
