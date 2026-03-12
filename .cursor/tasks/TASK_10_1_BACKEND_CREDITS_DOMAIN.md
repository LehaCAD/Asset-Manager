# TASK 10.1: Backend Credits Domain & API

> **Goal**: Реализовать backend-контур credits: persistence, transaction journal, balance/estimate API и доменный сервис атомарного debit/refund.

## Depends On

- [ ] TASK 10.0: Credits Contracts & Architecture Lock

## File Ownership

### Creates (new files)

- `backend/apps/credits/__init__.py` — пакет credits app.
- `backend/apps/credits/apps.py` — app config.
- `backend/apps/credits/models.py` — `CreditsTransaction`.
- `backend/apps/credits/services.py` — `CreditsService` и result objects.
- `backend/apps/credits/serializers.py` — serializers для balance и estimate.
- `backend/apps/credits/views.py` — balance и estimate endpoints.
- `backend/apps/credits/urls.py` — router для credits API.
- `backend/apps/credits/migrations/0001_initial.py` — миграция credits app.

### Modifies (existing files)

- `backend/apps/users/models.py` — реализовать поля `balance`, `pricing_percent`.
- `backend/apps/ai_providers/models.py` — реализовать `pricing_schema`.
- `backend/config/urls.py` — подключить `api/credits/`.
- `backend/config/settings.py` — добавить app в `INSTALLED_APPS`, если требуется.

### Reads (does NOT modify)

- `backend/apps/scenes/views.py` — будущий consumer debit flow.
- `backend/apps/elements/tasks.py` — будущий consumer refund flow.
- `.cursor/rules/credits-billing-architecture.mdc` — обязательные правила реализации.

## Contracts

### CreditsTransaction model

```python
class CreditsTransaction(models.Model):
    REASON_ADMIN_TOPUP = "admin_topup"
    REASON_ADMIN_ADJUSTMENT = "admin_adjustment"
    REASON_GENERATION_DEBIT = "generation_debit"
    REASON_GENERATION_REFUND = "generation_refund"
    REASON_REFUND_PROVIDER_ERROR = "refund_provider_error"
    REASON_REFUND_PRICING_FAILURE = "refund_pricing_failure"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="credits_transactions")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    balance_after = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.CharField(max_length=64)
    element = models.ForeignKey("elements.Element", null=True, blank=True, on_delete=models.SET_NULL, related_name="credits_transactions")
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
```

### Service result objects

```python
@dataclass(frozen=True)
class EstimateResult:
    cost: Decimal | None
    balance: Decimal
    can_afford: bool
    error: str | None

@dataclass(frozen=True)
class DebitResult:
    ok: bool
    cost: Decimal | None
    balance_after: Decimal
    error: str | None

@dataclass(frozen=True)
class RefundResult:
    refunded: bool
    balance_after: Decimal
```

### Service public methods

```python
class CreditsService:
    def get_balance_snapshot(self, user) -> CreditsBalanceResponse: ...
    def estimate_generation(self, user, ai_model, generation_config: dict) -> EstimateResult: ...
    def debit_for_generation(self, user, ai_model, generation_config: dict, *, element=None) -> DebitResult: ...
    def refund_for_generation(self, user, amount: Decimal, *, element=None, reason: str, metadata: dict | None = None) -> RefundResult: ...
```

## Required Imports

```python
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction
from django.db.models import F
```

## Implementation Details

- Все денежные операции выполняй через `Decimal`.
- В `estimate_generation()`:
  - считай `fixed_cost`, если он задан;
  - иначе собирай lookup key по `cost_params`;
  - если `pricing_schema` пустой, сломан или не содержит комбинацию — верни русскую ошибку поддержки;
  - применяй `pricing_percent`.
- В `debit_for_generation()`:
  - используй `select_for_update()` по пользователю;
  - не списывай, если estimate вернул ошибку;
  - не списывай, если средств не хватает;
  - при списании создавай `CreditsTransaction`.
- В `refund_for_generation()`:
  - добавляй деньги обратно;
  - записывай транзакцию;
  - делай логику идемпотентной по `element + reason`, чтобы повторный failure не дал двойной refund.
- `balance` endpoint должен возвращать текущий баланс и процент.
- `estimate` endpoint должен принимать `POST`, а не `GET`, чтобы безопасно передавать `generation_config`.

## Constraints

- DO NOT дублировать pricing logic в serializer или view.
- DO NOT использовать формулы, `eval`, интерпретатор выражений или динамическое вычисление.
- DO NOT использовать `float`.
- DO NOT запускать списание внутри `estimate`.
- DO NOT возвращать английские тексты ошибок.

## Acceptance Criteria

- [ ] Создан `backend/apps/credits/` с моделями, сервисом, serializer’ами и view.
- [ ] В проекте появились `POST /api/credits/estimate/` и `GET /api/credits/balance/`.
- [ ] Сервис умеет fixed pricing и lookup pricing.
- [ ] Пустой или некорректный `pricing_schema` возвращает русскую ошибку поддержки.
- [ ] Неизвестная комбинация параметров возвращает русскую ошибку поддержки.
- [ ] Недостаток средств возвращает `can_afford = false` и русскую ошибку.
- [ ] Каждое списание и возврат попадает в `CreditsTransaction`.
- [ ] Refund идемпотентен для одного `element + reason`.

## Integration Notes

- TASK 10.2 показывает и редактирует эти данные в админке.
- TASK 10.3 использует `balance` и `estimate` endpoint’ы.
- TASK 10.4 вызывает `debit_for_generation()` и `refund_for_generation()` из generate flow.
