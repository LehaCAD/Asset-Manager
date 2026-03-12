# TASK 10.0: Credits Contracts & Architecture Lock

> **Goal**: Зафиксировать все shared contracts для credits, pricing schema, transaction journal, API responses и frontend store shape до любой реализации.

## Depends On

- [ ] Нет. Это стартовая задача фазы.

## File Ownership

### Creates (new files)

- `.cursor/rules/credits-billing-architecture.mdc` — закрепляет обязательные архитектурные решения для credits.

### Modifies (existing files)

- `backend/apps/users/models.py` — добавить контрактные поля баланса и процента.
- `backend/apps/ai_providers/models.py` — добавить контрактное поле `pricing_schema`.
- `frontend/lib/types/index.ts` — добавить интерфейсы credits API.

### Reads (does NOT modify)

- `backend/apps/scenes/views.py` — текущий generate flow.
- `backend/apps/elements/tasks.py` — текущий failure flow.
- `frontend/lib/store/generation.ts` — текущая структура generation state.
- `frontend/components/layout/Navbar.tsx` — место будущего баланса.
- `frontend/components/generation/ConfigPanel.tsx` — место будущей стоимости и причин.

## Contracts

### Django model fields

```python
# backend/apps/users/models.py
balance = models.DecimalField(
    max_digits=12,
    decimal_places=2,
    default=Decimal("0.00"),
    verbose_name="Баланс"
)
pricing_percent = models.PositiveIntegerField(
    default=100,
    verbose_name="Процент цены",
    help_text="100 = по себестоимости, 80 = скидка 20%, 130 = наценка 30%"
)
```

```python
# backend/apps/ai_providers/models.py
pricing_schema = models.JSONField(
    default=dict,
    blank=False,
    verbose_name="Схема ценообразования",
    help_text='Либо {"fixed_cost": "5.00"}, либо {"cost_params": ["resolution", "duration"], "costs": {"720p|5": "3.00"}}'
)
```

### Backend pricing schema

```json
{
  "fixed_cost": "5.00"
}
```

```json
{
  "cost_params": ["width", "height"],
  "costs": {
    "512|512": "1.00",
    "1024|1024": "4.00"
  }
}
```

### Frontend API contracts

```typescript
export interface CreditsBalanceResponse {
  balance: string;
  pricing_percent: number;
  label: string;
}

export interface CreditsEstimateRequest {
  ai_model_id: number;
  generation_config: Record<string, unknown>;
}

export interface CreditsEstimateResponse {
  cost: string | null;
  balance: string;
  can_afford: boolean;
  error: string | null;
}
```

### Frontend store contract

```typescript
export interface CreditsState {
  balance: string;
  pricingPercent: number;
  estimateCost: string | null;
  canAfford: boolean;
  estimateError: string | null;
  isBalanceLoading: boolean;
  isEstimateLoading: boolean;
  loadBalance: () => Promise<void>;
  estimateGeneration: (payload: CreditsEstimateRequest) => Promise<void>;
  applyBalanceSnapshot: (payload: CreditsBalanceResponse) => void;
  clearEstimate: () => void;
}
```

### Required Russian error texts

```text
Недостаточно средств для генерации.
Не удалось определить стоимость генерации. Обратитесь в поддержку.
Не удалось загрузить баланс.
Не удалось рассчитать стоимость генерации.
```

## Required Imports

```python
from decimal import Decimal
```

```typescript
import type {
  CreditsBalanceResponse,
  CreditsEstimateRequest,
  CreditsEstimateResponse,
} from "@/lib/types";
```

## Implementation Details

- Добавь только контрактные поля и типы, без бизнес-логики debit/refund.
- Не создавай UI и не подключай endpoint’ы.
- Rule-файл должен жестко зафиксировать:
  - запрет на формулы;
  - обязательный `Decimal`;
  - обязательные русские тексты;
  - отсутствие fallback pricing;
  - единый источник правды для расчета цены на backend.

## Constraints

- DO NOT создавать новую логику расчета стоимости.
- DO NOT внедрять endpoint’ы, store implementations или generate integration.
- DO NOT использовать `float` или `number` как источник денежной истины на backend.
- DO NOT добавлять бесплатный fallback при пустом `pricing_schema`.

## Acceptance Criteria

- [ ] В `frontend/lib/types/index.ts` добавлены интерфейсы credits API.
- [ ] В user-модели зафиксированы поля `balance` и `pricing_percent`.
- [ ] В `AIModel` зафиксировано поле `pricing_schema`.
- [ ] Создан `.cursor/rules/credits-billing-architecture.mdc`.
- [ ] Все зафиксированные тексты ошибок указаны на русском.

## Integration Notes

- TASK 10.1 реализует backend по этим контрактам.
- TASK 10.2 использует новые model fields в админке.
- TASK 10.3 строит frontend store и UI строго по этим response shape.
- TASK 10.4 интегрирует generate flow, не меняя сами контракты.
