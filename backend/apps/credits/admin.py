from django.contrib import admin
from django.utils.html import format_html

from .models import Payment, PaymentWebhookLog


class PaymentWebhookLogInline(admin.TabularInline):
    model = PaymentWebhookLog
    extra = 0
    max_num = 0
    can_delete = False
    readonly_fields = [
        "created_at", "event_type", "processing_result_colored",
        "ip_address", "processing_time_ms", "error_message",
    ]
    fields = readonly_fields
    ordering = ["-created_at"]

    def processing_result_colored(self, obj):
        colors = {
            "ok": "#22C55E",
            "error": "#EF4444",
            "duplicate": "#F59E0B",
            "ip_rejected": "#EF4444",
        }
        color = colors.get(obj.processing_result, "#94A3B8")
        return format_html(
            '<span style="color:{};font-weight:600;">{}</span>',
            color, obj.get_processing_result_display(),
        )
    processing_result_colored.short_description = "Результат"

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = [
        "id", "user", "amount_display", "method_display",
        "status_colored", "yookassa_payment_id", "created_at",
    ]
    list_filter = ["status", "payment_method_type", "created_at"]
    search_fields = ["user__username", "user__email", "yookassa_payment_id"]
    readonly_fields = [
        "user", "yookassa_payment_id", "amount", "payment_method_type",
        "status", "credits_transaction", "error_message", "metadata",
        "created_at", "updated_at",
    ]
    inlines = [PaymentWebhookLogInline]
    date_hierarchy = "created_at"
    list_per_page = 50

    def amount_display(self, obj):
        return f"{obj.amount} ₽"
    amount_display.short_description = "Сумма"

    def method_display(self, obj):
        return obj.get_payment_method_type_display()
    method_display.short_description = "Способ"

    def status_colored(self, obj):
        colors = {
            "pending": "#F59E0B",
            "succeeded": "#22C55E",
            "canceled": "#EF4444",
            "expired": "#94A3B8",
            "waiting_for_capture": "#3B82F6",
        }
        color = colors.get(obj.status, "#94A3B8")
        return format_html(
            '<span style="color:{};font-weight:600;">{}</span>',
            color, obj.get_status_display(),
        )
    status_colored.short_description = "Статус"

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(PaymentWebhookLog)
class PaymentWebhookLogAdmin(admin.ModelAdmin):
    list_display = [
        "id", "created_at", "event_type", "yookassa_payment_id",
        "processing_result_colored", "ip_address", "processing_time_ms",
    ]
    list_filter = ["processing_result", "event_type", "created_at"]
    search_fields = ["yookassa_payment_id"]
    readonly_fields = [
        "payment", "yookassa_payment_id", "event_type", "raw_body",
        "ip_address", "processing_result", "error_message",
        "processing_time_ms", "created_at",
    ]
    date_hierarchy = "created_at"
    list_per_page = 50

    def processing_result_colored(self, obj):
        colors = {
            "ok": "#22C55E",
            "error": "#EF4444",
            "duplicate": "#F59E0B",
            "ip_rejected": "#EF4444",
        }
        color = colors.get(obj.processing_result, "#94A3B8")
        return format_html(
            '<span style="color:{};font-weight:600;">{}</span>',
            color, obj.get_processing_result_display(),
        )
    processing_result_colored.short_description = "Результат"

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False
