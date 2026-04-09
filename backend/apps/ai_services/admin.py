from django.contrib import admin
from django.utils.html import format_html
from .models import LLMProvider, AIService


@admin.register(LLMProvider)
class LLMProviderAdmin(admin.ModelAdmin):
    list_display = ("name", "provider_type", "display_url", "display_status")
    list_filter = ("provider_type", "is_active")
    readonly_fields = ("created_at",)
    fieldsets = (
        ("Основное", {"fields": ("name", "provider_type", "api_base_url", "api_key", "is_active")}),
        ("Даты", {"fields": ("created_at",), "classes": ("collapse",)}),
    )

    def display_url(self, obj):
        url = obj.api_base_url
        return url[:40] + "..." if len(url) > 40 else url
    display_url.short_description = "URL"

    def display_status(self, obj):
        if obj.is_active:
            return format_html('<span style="color: #4ade80; font-weight: bold;">● Активен</span>')
        return format_html('<span style="color: #94a3b8;">● Неактивен</span>')
    display_status.short_description = "Статус"


@admin.register(AIService)
class AIServiceAdmin(admin.ModelAdmin):
    list_display = ("name", "service_type", "display_provider", "model_name", "display_cost", "display_status")
    list_filter = ("service_type", "is_active")
    readonly_fields = ("created_at",)
    fieldsets = (
        ("Основное", {"fields": ("service_type", "name", "provider", "model_name", "is_active")}),
        ("Системный промпт", {"fields": ("system_prompt",),
         "description": "Инструкция для LLM. Редактируется в формате plain text."}),
        ("Параметры", {"fields": ("parameters",),
         "description": '{"temperature": 0.7, "max_tokens": 500, "top_p": 1.0, "timeout": 15}'}),
        ("Стоимость", {"fields": ("cost_per_call",)}),
        ("Даты", {"fields": ("created_at",), "classes": ("collapse",)}),
    )

    def display_provider(self, obj):
        return obj.provider.name
    display_provider.short_description = "Провайдер"

    def display_cost(self, obj):
        return f"{obj.cost_per_call} кадров"
    display_cost.short_description = "Стоимость"

    def display_status(self, obj):
        if obj.is_active:
            return format_html('<span style="color: #4ade80; font-weight: bold;">● Активен</span>')
        return format_html('<span style="color: #94a3b8;">● Неактивен</span>')
    display_status.short_description = "Статус"
