# TASK 10.2: Admin Pricing And Balance Controls

> **Goal**: Сделать админку пригодной для ручного пополнения баланса, настройки пользовательского процента и редактирования `pricing_schema` моделей без формул.

## Depends On

- [ ] TASK 10.0: Credits Contracts & Architecture Lock

## File Ownership

### Modifies (existing files)

- `backend/apps/users/admin.py` — добавить баланс, процент, inline или readonly историю транзакций, экшены пополнения.
- `backend/apps/ai_providers/admin.py` — добавить `pricing_schema` в админку модели и понятные подсказки.

### Reads (does NOT modify)

- `backend/apps/users/models.py` — поля `balance`, `pricing_percent`.
- `backend/apps/ai_providers/models.py` — поле `pricing_schema`.
- `backend/apps/credits/models.py` — журнал `CreditsTransaction`.
- `.cursor/rules/credits-billing-architecture.mdc` — обязательные правила.

## Contracts

### User admin requirements

```text
Поля:
- balance
- pricing_percent

Readonly:
- created_at
- updated_at

История:
- created_at
- amount
- balance_after
- reason
- element
```

### AIModel admin help text requirements

```text
Фиксированная стоимость:
{"fixed_cost": "5.00"}

Стоимость по параметрам:
{"cost_params": ["resolution", "duration"], "costs": {"720p|5": "3.00", "1080p|8": "7.00"}}
```

## Required Imports

```python
from django.contrib import admin
from django.utils.html import format_html
```

## Implementation Details

- В `users/admin.py`:
  - добавь `balance` и `pricing_percent` в `list_display` и `fieldsets`;
  - добавь быстрый просмотр последних транзакций пользователя;
  - добавь хотя бы один безопасный admin action или inline-механику для ручного пополнения;
  - все подписи и help text держи на русском.
- В `ai_providers/admin.py`:
  - добавь `pricing_schema` в отдельную секцию;
  - рядом дай примеры fixed pricing и lookup pricing;
  - явно напиши, что формулы запрещены и используются только lookup-значения.

## Constraints

- DO NOT менять доменную логику credits.
- DO NOT добавлять редактор формул или внешние зависимости.
- DO NOT хранить вспомогательные расчеты в admin-only полях.
- DO NOT убирать существующие поля AIModel из админки.

## Acceptance Criteria

- [ ] В админке пользователя видны `balance` и `pricing_percent`.
- [ ] Админ может пополнить или скорректировать баланс вручную.
- [ ] История транзакций пользователя доступна из админки.
- [ ] В админке AI-модели доступно поле `pricing_schema`.
- [ ] Примеры JSON и запрет формул явно подсказаны в UI админки.
- [ ] Все тексты админки по credits на русском.

## Integration Notes

- TASK 10.1 должен предоставить модель транзакций.
- TASK 10.4 будет писать generation debit/refund, которые затем видны в истории пользователя.
