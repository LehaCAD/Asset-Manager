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
    REASON_PAYMENT_TOPUP = "payment_topup"
    REASON_TRIAL_BONUS = "trial_bonus"
    REASON_FEEDBACK_REWARD = "feedback_reward"
    REASON_PROMPT_ENHANCEMENT = "prompt_enhancement"

    REASON_CHOICES = [
        (REASON_ADMIN_TOPUP, "Пополнение администратором"),
        (REASON_ADMIN_ADJUSTMENT, "Корректировка администратором"),
        (REASON_GENERATION_DEBIT, "Списание за генерацию"),
        (REASON_GENERATION_REFUND, "Возврат за генерацию"),
        (REASON_REFUND_PROVIDER_ERROR, "Возврат: ошибка провайдера"),
        (REASON_REFUND_PRICING_FAILURE, "Возврат: ошибка ценообразования"),
        (REASON_PAYMENT_TOPUP, "Пополнение (онлайн-оплата)"),
        (REASON_TRIAL_BONUS, "Бонус за триал"),
        (REASON_FEEDBACK_REWARD, "Награда за обратную связь"),
        (REASON_PROMPT_ENHANCEMENT, "Усиление промпта"),
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
    project = models.ForeignKey(
        "projects.Project",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="credits_transactions",
        verbose_name="Проект"
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
            models.Index(fields=["project", "reason"]),
        ]
    
    def __str__(self) -> str:
        sign = "+" if self.amount > 0 else ""
        return f"{self.user.username}: {sign}{self.amount} ({self.reason}) -> {self.balance_after}"


class Payment(models.Model):
    """Tracks YooKassa payment lifecycle."""

    STATUS_PENDING = "pending"
    STATUS_WAITING = "waiting_for_capture"
    STATUS_SUCCEEDED = "succeeded"
    STATUS_CANCELED = "canceled"
    STATUS_EXPIRED = "expired"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Ожидание"),
        (STATUS_WAITING, "Ожидание подтверждения"),
        (STATUS_SUCCEEDED, "Успешно"),
        (STATUS_CANCELED, "Отменено"),
        (STATUS_EXPIRED, "Истекло"),
    ]

    METHOD_SBP = "sbp"
    METHOD_BANK_CARD = "bank_card"
    METHOD_SBERBANK = "sberbank"

    METHOD_CHOICES = [
        (METHOD_SBP, "СБП"),
        (METHOD_BANK_CARD, "Банковская карта"),
        (METHOD_SBERBANK, "SberPay"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="payments",
        verbose_name="Пользователь",
    )
    yookassa_payment_id = models.CharField(
        max_length=64, unique=True, db_index=True,
        verbose_name="ID платежа ЮKassa",
    )
    amount = models.DecimalField(
        max_digits=10, decimal_places=2,
        verbose_name="Сумма",
    )
    payment_method_type = models.CharField(
        max_length=32, choices=METHOD_CHOICES,
        verbose_name="Способ оплаты",
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING,
        verbose_name="Статус",
    )
    credits_transaction = models.OneToOneField(
        CreditsTransaction, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="payment",
        verbose_name="Транзакция кредитов",
    )
    error_message = models.TextField(
        blank=True, default="",
        verbose_name="Сообщение об ошибке",
    )
    metadata = models.JSONField(
        default=dict, blank=True,
        verbose_name="Метаданные",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Создан")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Обновлён")

    class Meta:
        verbose_name = "Платёж"
        verbose_name_plural = "Платежи"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"Payment {self.yookassa_payment_id} [{self.status}] {self.amount}₽ ({self.user})"


class PaymentWebhookLog(models.Model):
    """Every incoming webhook from YooKassa, logged BEFORE processing."""

    RESULT_OK = "ok"
    RESULT_ERROR = "error"
    RESULT_DUPLICATE = "duplicate"
    RESULT_IP_REJECTED = "ip_rejected"

    RESULT_CHOICES = [
        (RESULT_OK, "Обработано"),
        (RESULT_ERROR, "Ошибка"),
        (RESULT_DUPLICATE, "Дубликат"),
        (RESULT_IP_REJECTED, "IP отклонён"),
    ]

    payment = models.ForeignKey(
        Payment, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="webhook_logs",
        verbose_name="Платёж",
    )
    yookassa_payment_id = models.CharField(
        max_length=64, db_index=True,
        verbose_name="ID платежа ЮKassa",
    )
    event_type = models.CharField(
        max_length=64,
        verbose_name="Тип события",
    )
    raw_body = models.JSONField(verbose_name="Сырые данные")
    ip_address = models.GenericIPAddressField(verbose_name="IP адрес")
    is_trusted_ip = models.BooleanField(
        default=False, verbose_name="Доверенный IP",
    )
    processing_result = models.CharField(
        max_length=32, choices=RESULT_CHOICES,
        default="", blank=True,
        verbose_name="Результат обработки",
    )
    error_message = models.TextField(
        blank=True, default="",
        verbose_name="Сообщение об ошибке",
    )
    processing_time_ms = models.PositiveIntegerField(
        null=True, verbose_name="Время обработки (мс)",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Создан")

    class Meta:
        verbose_name = "Лог webhook"
        verbose_name_plural = "Логи webhook"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Webhook {self.event_type} for {self.yookassa_payment_id} [{self.processing_result}]"
