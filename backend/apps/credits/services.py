from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP, ROUND_CEILING
from typing import Any

from django.db import transaction
from django.db.models import F

from apps.ai_providers.services import compile_pricing_payload
from apps.ai_providers.models import AIModel
from apps.users.models import User

from .models import CreditsTransaction


@dataclass(frozen=True)
class EstimateResult:
    """Результат оценки стоимости генерации."""
    cost: Decimal | None
    balance: Decimal
    can_afford: bool
    error: str | None


@dataclass(frozen=True)
class DebitResult:
    """Результат списания за генерацию."""
    ok: bool
    cost: Decimal | None
    balance_after: Decimal
    error: str | None


@dataclass(frozen=True)
class RefundResult:
    """Результат возврата средств."""
    refunded: bool
    balance_after: Decimal


@dataclass(frozen=True)
class BalanceMutationResult:
    balance_after: Decimal


class CreditsService:
    """Сервис для работы с кредитами пользователя."""
    
    ERROR_INSUFFICIENT_FUNDS = "Недостаточно средств для генерации."
    ERROR_INVALID_PRICING = "Не удалось определить стоимость генерации. Обратитесь в поддержку."
    
    def get_balance_snapshot(self, user: User) -> dict[str, Any]:
        """Получить текущий снапшот баланса пользователя."""
        return {
            "balance": str(user.balance),
            "pricing_percent": user.pricing_percent,
            "label": f"{user.balance} зар.",
        }
    
    def estimate_generation(
        self,
        user: User,
        ai_model: AIModel,
        generation_config: dict
    ) -> EstimateResult:
        """
        Оценить стоимость генерации без списания средств.
        
        Returns:
            EstimateResult с cost, balance, can_afford, error
        """
        base_cost = self._calculate_base_cost(ai_model, generation_config)
        
        if base_cost is None:
            return EstimateResult(
                cost=None,
                balance=user.balance,
                can_afford=False,
                error=self.ERROR_INVALID_PRICING
            )
        
        # Применяем pricing_percent пользователя
        final_cost = self._apply_pricing_percent(base_cost, user.pricing_percent)
        
        can_afford = user.balance >= final_cost
        
        return EstimateResult(
            cost=final_cost,
            balance=user.balance,
            can_afford=can_afford,
            error=None
        )

    @transaction.atomic
    def topup(
        self,
        user: User,
        amount: Decimal,
        *,
        reason: str,
        metadata: dict | None = None,
    ) -> BalanceMutationResult:
        user = User.objects.select_for_update().get(pk=user.pk)
        user.balance += amount
        user.save(update_fields=["balance"])

        CreditsTransaction.objects.create(
            user=user,
            amount=amount,
            balance_after=user.balance,
            reason=reason,
            metadata=metadata or {},
        )

        return BalanceMutationResult(balance_after=user.balance)

    @transaction.atomic
    def debit_flat(self, user, amount, reason, element=None, metadata=None):
        """Debit a fixed amount (not tied to AIModel pricing)."""
        if amount <= 0:
            return DebitResult(ok=True, cost=Decimal("0"), balance_after=user.balance, error=None)

        locked_user = type(user).objects.select_for_update().get(pk=user.pk)
        if locked_user.balance < amount:
            return DebitResult(
                ok=False, cost=Decimal("0"), balance_after=locked_user.balance,
                error="Недостаточно кадров",
            )
        locked_user.balance -= amount
        locked_user.save(update_fields=["balance"])

        CreditsTransaction.objects.create(
            user=locked_user,
            amount=-amount,
            balance_after=locked_user.balance,
            reason=reason,
            element=element,
            metadata=metadata or {},
        )

        return DebitResult(ok=True, cost=amount, balance_after=locked_user.balance, error=None)

    @transaction.atomic
    def debit_for_generation(
        self,
        user: User,
        ai_model: AIModel,
        generation_config: dict,
        *,
        element=None,
        metadata: dict | None = None,
    ) -> DebitResult:
        """
        Списать средства за генерацию.
        
        Args:
            user: Пользователь
            ai_model: AI модель для генерации
            generation_config: Конфиг генерации
            element: Связанный элемент (опционально)
            
        Returns:
            DebitResult с результатом операции
        """
        # Блокируем запись пользователя
        user = User.objects.select_for_update().get(pk=user.pk)
        
        # Сначала делаем estimate
        estimate = self.estimate_generation(user, ai_model, generation_config)
        
        if estimate.error:
            return DebitResult(
                ok=False,
                cost=None,
                balance_after=user.balance,
                error=estimate.error
            )
        
        if not estimate.can_afford:
            return DebitResult(
                ok=False,
                cost=None,
                balance_after=user.balance,
                error=self.ERROR_INSUFFICIENT_FUNDS
            )
        
        cost = estimate.cost
        
        # Списываем средства
        user.balance -= cost
        user.save(update_fields=["balance"])
        
        # Создаём транзакцию
        transaction_metadata = {
            "ai_model_id": ai_model.id,
            "ai_model_name": ai_model.name,
            "generation_config": generation_config,
            "base_cost": str(self._calculate_base_cost(ai_model, generation_config)),
            "pricing_percent": user.pricing_percent,
        }
        if metadata:
            transaction_metadata.update(metadata)

        CreditsTransaction.objects.create(
            user=user,
            amount=-cost,
            balance_after=user.balance,
            reason=CreditsTransaction.REASON_GENERATION_DEBIT,
            element=element,
            metadata=transaction_metadata,
        )
        
        return DebitResult(
            ok=True,
            cost=cost,
            balance_after=user.balance,
            error=None
        )
    
    @transaction.atomic
    def refund_for_generation(
        self,
        user: User,
        amount: Decimal,
        *,
        element=None,
        reason: str = CreditsTransaction.REASON_GENERATION_REFUND,
        metadata: dict | None = None
    ) -> RefundResult:
        """
        Вернуть средства за генерацию.
        
        Идемпотентна: повторный вызов с тем же element + reason не даст двойного возврата.
        
        Args:
            user: Пользователь
            amount: Сумма возврата
            element: Связанный элемент
            reason: Причина возврата
            metadata: Дополнительные метаданные
            
        Returns:
            RefundResult с результатом операции
        """
        # Блокируем запись пользователя
        user = User.objects.select_for_update().get(pk=user.pk)
        
        # Проверяем идемпотентность по element + reason
        operation_key = (metadata or {}).get("operation_key")
        if operation_key and CreditsTransaction.objects.filter(
            user=user,
            reason=reason,
            metadata__operation_key=operation_key
        ).exists():
            return RefundResult(
                refunded=False,
                balance_after=user.balance
            )

        if element and CreditsTransaction.objects.filter(
            user=user,
            element=element,
            reason=reason
        ).exists():
            # Уже был возврат для этого элемента с этой причиной
            return RefundResult(
                refunded=False,
                balance_after=user.balance
            )
        
        # Возвращаем средства
        user.balance += amount
        user.save(update_fields=["balance"])
        
        # Создаём транзакцию
        CreditsTransaction.objects.create(
            user=user,
            amount=amount,
            balance_after=user.balance,
            reason=reason,
            element=element,
            metadata=metadata or {}
        )
        
        return RefundResult(
            refunded=True,
            balance_after=user.balance
        )
    
    def _calculate_base_cost(
        self,
        ai_model: AIModel,
        generation_config: dict
    ) -> Decimal | None:
        """
        Рассчитать базовую стоимость генерации.
        
        Returns:
            Decimal стоимость или None если не удалось рассчитать
        """
        pricing_schema = ai_model.get_runtime_pricing_schema() if hasattr(ai_model, "get_runtime_pricing_schema") else compile_pricing_payload(ai_model)
        
        if not pricing_schema or not isinstance(pricing_schema, dict):
            return None
        
        # Fixed cost pricing
        if "fixed_cost" in pricing_schema:
            try:
                return Decimal(str(pricing_schema["fixed_cost"]))
            except (ValueError, TypeError):
                return None
        
        # Lookup pricing
        if "cost_params" in pricing_schema and "costs" in pricing_schema:
            cost_params = pricing_schema["cost_params"]
            costs = pricing_schema["costs"]
            
            if not isinstance(cost_params, list) or not isinstance(costs, dict):
                return None
            
            # Собираем ключ по параметрам
            key_parts = []
            for param in cost_params:
                value = generation_config.get(param)
                if value is None and hasattr(ai_model, "parameter_bindings"):
                    binding = ai_model.parameter_bindings.select_related("canonical_parameter").filter(
                        canonical_parameter__code=param
                    ).first()
                    if binding:
                        value = generation_config.get(binding.placeholder)
                if value is None:
                    return None
                # Normalize booleans to lowercase (True → "true") for lookup key
                if isinstance(value, bool):
                    key_parts.append(str(value).lower())
                else:
                    key_parts.append(str(value))
            
            lookup_key = "|".join(key_parts)
            
            if lookup_key not in costs:
                return None
            
            try:
                raw_cost = str(costs[lookup_key]).strip()
                if not raw_cost:
                    return None
                return Decimal(raw_cost)
            except (ValueError, TypeError, InvalidOperation):
                return None
        
        # Ни fixed_cost, ни lookup pricing не найдены
        return None
    
    @staticmethod
    def _round_up_to_half(value: Decimal) -> Decimal:
        """Округление вверх до ближайших 0.5 (в пользу владельца).

        7.02 → 7.5, 3.50 → 3.5, 5.00 → 5.0, 4.01 → 4.5
        """
        doubled = value * 2
        ceiled = doubled.to_integral_value(rounding=ROUND_CEILING)
        return ceiled / 2

    def _apply_pricing_percent(self, base_cost: Decimal, pricing_percent: int) -> Decimal:
        """
        pricing_percent=100 -> себестоимость (100%)
        pricing_percent=80 -> скидка 20% (80%)
        pricing_percent=130 -> наценка 30% (130%)
        """
        multiplier = Decimal(pricing_percent) / Decimal(100)
        final_cost = base_cost * multiplier
        return self._round_up_to_half(final_cost)


class PaymentService:
    """Handles YooKassa payment lifecycle: creation, webhook processing, reconciliation."""

    @staticmethod
    def create_payment(user, amount: Decimal, payment_method_type: str) -> "Payment":
        """Create a Payment record and initiate YooKassa payment.

        Returns Payment with yookassa_payment_id and confirmation_url in metadata.
        """
        from .models import Payment
        from . import yookassa_client

        yk_response = yookassa_client.create_payment(
            amount=str(amount),
            payment_method_type=payment_method_type,
            description=f"Пополнение баланса: {amount}₽",
            metadata={"user_id": str(user.id)},
        )

        payment = Payment.objects.create(
            user=user,
            yookassa_payment_id=yk_response["id"],
            amount=amount,
            payment_method_type=payment_method_type,
            status=Payment.STATUS_PENDING,
            metadata={"confirmation_url": yk_response["confirmation_url"]},
        )
        return payment

    @staticmethod
    @transaction.atomic
    def process_succeeded(payment_id: int) -> bool:
        """Process a succeeded payment: topup user balance.

        Returns True if credits were added, False if already processed (idempotent).
        """
        from .models import Payment

        payment = Payment.objects.select_for_update().get(id=payment_id)
        if payment.status == Payment.STATUS_SUCCEEDED:
            return False  # Already processed — idempotent

        payment.status = Payment.STATUS_SUCCEEDED
        CreditsService().topup(
            payment.user,
            payment.amount,
            reason=CreditsTransaction.REASON_PAYMENT_TOPUP,
            metadata={"yookassa_payment_id": payment.yookassa_payment_id},
        )
        payment.credits_transaction = CreditsTransaction.objects.filter(
            user=payment.user,
            metadata__yookassa_payment_id=payment.yookassa_payment_id,
        ).first()
        payment.save()
        return True

    @staticmethod
    def process_canceled(payment_id: int, reason: str = "") -> None:
        """Mark payment as canceled."""
        from .models import Payment

        payment = Payment.objects.get(id=payment_id)
        if payment.status in (Payment.STATUS_SUCCEEDED, Payment.STATUS_CANCELED):
            return
        payment.status = Payment.STATUS_CANCELED
        payment.error_message = reason
        payment.save()
