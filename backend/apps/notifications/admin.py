from django.contrib import admin
from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('type', 'user', 'title', 'is_read', 'created_at')
    list_filter = ('type', 'is_read', 'created_at')
    readonly_fields = ('created_at',)
