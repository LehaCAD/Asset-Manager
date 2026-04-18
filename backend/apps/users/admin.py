from decimal import Decimal

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.utils.html import format_html

from apps.credits.models import CreditsTransaction
from apps.credits.services import CreditsService

from .models import User


class CreditsTransactionInline(admin.TabularInline):
    """Inline для просмотра истории транзакций пользователя."""

    model = CreditsTransaction
    fields = ("created_at", "amount_colored", "balance_after", "reason", "element_link")
    readonly_fields = ("created_at", "amount_colored", "balance_after", "reason", "element_link")
    extra = 0
    max_num = 0
    can_delete = False
    ordering = ("-created_at",)

    def amount_colored(self, obj):
        """Отображение суммы с цветом: зелёный для пополнения, красный для списания."""
        color = "#28a745" if obj.amount > 0 else "#dc3545"
        sign = "+" if obj.amount > 0 else ""
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}{}</span>',
            color,
            sign,
            obj.amount,
        )

    amount_colored.short_description = "Сумма"

    def element_link(self, obj):
        """Ссылка на элемент, если есть."""
        if obj.element:
            return format_html(
                '<a href="/admin/elements/element/{}/change/">Элемент #{}</a>',
                obj.element.id,
                obj.element.id,
            )
        return "-"

    element_link.short_description = "Элемент"

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ("username", "email", "balance_display", "pricing_percent", "is_staff", "created_at")
    list_filter = ("is_staff", "is_superuser", "is_active", "pricing_percent")
    search_fields = ("username", "email")
    ordering = ("-created_at",)

    fieldsets = (
        (None, {"fields": ("username", "password")}),
        ("Персональная информация", {"fields": ("first_name", "last_name", "email")}),
        (
            "Права доступа",
            {
                "fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions"),
            },
        ),
        ("Важные даты", {"fields": ("last_login", "date_joined")}),
        (
            "Кредиты и ценообразование",
            {
                "fields": ("balance", "pricing_percent"),
                "description": (
                    "<strong>Баланс</strong> — текущие средства пользователя.<br>"
                    "<strong>Процент цены</strong> — 100 = по себестоимости, "
                    "80 = скидка 20%, 130 = наценка 30%"
                ),
            },
        ),
    )

    inlines = [CreditsTransactionInline]
    actions = ["topup_balance_100", "topup_balance_500", "topup_balance_1000"]

    def balance_display(self, obj):
        """Отображение баланса с цветовой индикацией."""
        color = "#28a745" if obj.balance > 0 else "#6c757d"
        return format_html('<span style="color: {}; font-weight: bold;">{} ₽</span>', color, obj.balance)

    balance_display.short_description = "Баланс"

    def _topup_users(self, request, queryset, amount: Decimal, action_name: str) -> None:
        service = CreditsService()
        for user in queryset:
            service.topup(
                user=user,
                amount=amount,
                reason=CreditsTransaction.REASON_ADMIN_TOPUP,
                metadata={"admin_action": action_name},
            )
        self.message_user(request, f"Баланс пополнен для {queryset.count()} пользователей")

    @admin.action(description="Пополнить баланс на 100 ₽")
    def topup_balance_100(self, request, queryset):
        self._topup_users(request, queryset, Decimal("100.00"), "topup_balance_100")

    @admin.action(description="Пополнить баланс на 500 ₽")
    def topup_balance_500(self, request, queryset):
        self._topup_users(request, queryset, Decimal("500.00"), "topup_balance_500")

    @admin.action(description="Пополнить баланс на 1000 ₽")
    def topup_balance_1000(self, request, queryset):
        self._topup_users(request, queryset, Decimal("1000.00"), "topup_balance_1000")
