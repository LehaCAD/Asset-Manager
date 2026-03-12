from decimal import Decimal

from django.conf import settings
from django.db import models


class CreditsTransaction(models.Model):
    """Журнал транзакций кредитов пользователя."""
    
    REASON_ADMIN_TOPUP = "admin_topup"
    REASON_ADMIN_ADJUSTMENT = "admin_adjustment"
    REASON_GENERATION_DEBIT = "generation_debit"
    REASON_GENERATION_REFUND = "generation_refund"
    REASON_REFUND_PROVIDER_ERROR = "refund_provider_error"
    REASON_REFUND_PRICING_FAILURE = "refund_pricing_failure"
    
    REASON_CHOICES = [
        (REASON_ADMIN_TOPUP, "Пополнение администратором"),
        (REASON_ADMIN_ADJUSTMENT, "Корректировка администратором"),
        (REASON_GENERATION_DEBIT, "Списание за генерацию"),
        (REASON_GENERATION_REFUND, "Возврат за генерацию"),
        (REASON_REFUND_PROVIDER_ERROR, "Возврат: ошибка провайдера"),
        (REASON_REFUND_PRICING_FAILURE, "Возврат: ошибка ценообразования"),
    ]
    
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="credits_transactions",
        verbose_name="Пользователь"
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name="Сумма"
    )
    balance_after = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name="Баланс после"
    )
    reason = models.CharField(
        max_length=64,
        choices=REASON_CHOICES,
        verbose_name="Причина"
    )
    element = models.ForeignKey(
        "elements.Element",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="credits_transactions",
        verbose_name="Элемент"
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="Метаданные"
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Дата создания"
    )
    
    class Meta:
        verbose_name = "Транзакция кредитов"
        verbose_name_plural = "Транзакции кредитов"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["element", "reason"]),
        ]
    
    def __str__(self) -> str:
        sign = "+" if self.amount > 0 else ""
        return f"{self.user.username}: {sign}{self.amount} ({self.reason}) -> {self.balance_after}"
