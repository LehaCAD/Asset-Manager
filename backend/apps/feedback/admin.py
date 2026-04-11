from django.contrib import admin
from django.template.response import TemplateResponse
from .models import Conversation, Message, Attachment, FeedbackReward


class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    readonly_fields = ("sender", "is_admin", "text", "created_at")


class RewardInline(admin.TabularInline):
    model = FeedbackReward
    extra = 0
    readonly_fields = ("amount", "comment", "granted_by", "created_at")


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("user", "status", "tag", "updated_at")
    list_filter = ("status", "tag")
    search_fields = ("user__username", "user__email")
    inlines = [MessageInline, RewardInline]


@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ("file_name", "content_type", "file_size", "is_expired", "created_at")
    list_filter = ("is_expired", "content_type")


def inbox_view(request):
    """Кастомная страница Django Admin: Telegram-style inbox."""
    context = {
        **admin.site.each_context(request),
        "title": "Входящие — Обратная связь",
    }
    return TemplateResponse(request, "admin/feedback/inbox.html", context)


admin.site.index_template = 'admin/custom_index.html'
