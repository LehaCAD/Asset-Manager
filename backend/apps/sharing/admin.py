from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone
from .models import SharedLink, Comment


@admin.register(SharedLink)
class SharedLinkAdmin(admin.ModelAdmin):
    """Админка для модели SharedLink."""
    list_display = ('token_display', 'project', 'expires_at', 'status_display', 'created_at')
    list_filter = ('created_at', 'expires_at', 'project__user')
    search_fields = ('token', 'project__name')
    readonly_fields = ('token', 'created_at', 'updated_at')
    ordering = ('-created_at',)
    
    fieldsets = (
        ('Основная информация', {
            'fields': ('project', 'token')
        }),
        ('Срок действия', {
            'fields': ('expires_at',),
            'description': 'Оставьте пустым для бессрочной ссылки'
        }),
        ('Временные метки', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def token_display(self, obj):
        """Укороченное отображение токена."""
        token_str = str(obj.token)
        return format_html('<code>{}</code>', token_str[:13] + '...')
    token_display.short_description = 'Токен'
    
    def status_display(self, obj):
        """Статус ссылки (активна/истекла)."""
        if obj.is_expired():
            return format_html('<span style="color: red;">❌ Истекла</span>')
        return format_html('<span style="color: green;">✓ Активна</span>')
    status_display.short_description = 'Статус'


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    """Админка для модели Comment."""
    list_display = ('author_name', 'box', 'text_preview', 'is_read', 'created_at')
    list_filter = ('is_read', 'created_at', 'box__project')
    search_fields = ('author_name', 'text', 'box__name')
    list_editable = ('is_read',)
    readonly_fields = ('created_at', 'updated_at')
    ordering = ('-created_at',)
    
    fieldsets = (
        ('Основная информация', {
            'fields': ('box', 'author_name', 'is_read')
        }),
        ('Комментарий', {
            'fields': ('text',)
        }),
        ('Временные метки', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def text_preview(self, obj):
        """Превью текста комментария."""
        preview = obj.text[:60] + '...' if len(obj.text) > 60 else obj.text
        return preview
    text_preview.short_description = 'Текст'
    
    actions = ['mark_as_read', 'mark_as_unread']
    
    def mark_as_read(self, request, queryset):
        """Отметить комментарии как прочитанные."""
        updated = queryset.update(is_read=True)
        self.message_user(request, f'{updated} комментариев отмечено как прочитанные.')
    mark_as_read.short_description = 'Отметить как прочитанные'
    
    def mark_as_unread(self, request, queryset):
        """Отметить комментарии как непрочитанные."""
        updated = queryset.update(is_read=False)
        self.message_user(request, f'{updated} комментариев отмечено как непрочитанные.')
    mark_as_unread.short_description = 'Отметить как непрочитанные'
