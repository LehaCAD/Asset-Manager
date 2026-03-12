# TASK 10.4: Generation Debit / Refund Integration

> **Goal**: Встроить credits-проверку в flow генерации, блокировать запуск при невозможности оплаты и делать refund при provider failure без расхождения между UI и backend.

## Depends On

- [ ] TASK 10.1: Backend Credits Domain & API
- [ ] TASK 10.3: Frontend Credits State & UI

## File Ownership

### Modifies (existing files)

- `backend/apps/scenes/views.py` — вызывать debit до создания `Element`.
- `backend/apps/elements/tasks.py` — вызывать refund при failure и provider error.
- `frontend/lib/store/generation.ts` — триггерить estimate и учитывать `can_afford`.
- `frontend/components/generation/PromptBar.tsx` — блокировать кнопку генерации без дополнительного текста.

### Reads (does NOT modify)

- `backend/apps/credits/services.py` — debit/refund API.
- `frontend/lib/store/credits.ts` — estimate и balance snapshot.
- `frontend/components/generation/ConfigPanel.tsx` — уже показывает причины и стоимость.
- `.cursor/rules/credits-billing-architecture.mdc` — обязательные правила.

## Contracts

### Backend integration rules

```python
# Scene generate flow
debit_result = credits_service.debit_for_generation(
    user=request.user,
    ai_model=ai_model,
    generation_config=generation_config,
)
```

```python
# Failure flow
credits_service.refund_for_generation(
    user=element.scene.project.user,
    amount=charged_amount,
    element=element,
    reason=CreditsTransaction.REASON_REFUND_PROVIDER_ERROR,
    metadata={"source": "provider_failure"},
)
```

### Frontend generation rules

```typescript
// generation store must consume credits store state
canGenerate(): boolean
```

Поведение:

- `selectedModel` отсутствует -> нельзя генерировать;
- estimate loading -> можно оставить disabled для надежности;
- `canAfford === false` -> нельзя генерировать;
- `estimateError !== null` -> нельзя генерировать.

## Required Imports

```python
from apps.credits.services import CreditsService
```

```typescript
import { useCreditsStore } from "@/lib/store/credits";
```

## Implementation Details

- В `generation.ts`:
  - при смене модели и параметров запускай `estimateGeneration`;
  - не дублируй цену в generation store, если она уже лежит в credits store;
  - `canGenerate()` должен учитывать состояние credits.
- В `PromptBar.tsx`:
  - кнопка `Сгенерировать` становится disabled, если `canGenerate()` вернул `false`;
  - рядом с кнопкой не добавляй текст и не меняй копирайтинг.
- В `scenes/views.py`:
  - до создания `Element` выполни debit;
  - если debit неуспешен, верни русскую ошибку и не создавай `Element`.
- В `elements/tasks.py`:
  - при финальной ошибке провайдера сделай refund;
  - не делай refund на временных retry, только на terminal failure;
  - защищайся от двойного refund.

## Constraints

- DO NOT создавать локальную формулу стоимости в frontend.
- DO NOT запускать генерацию, если estimate вернул ошибку.
- DO NOT делать refund при каждом retry.
- DO NOT менять тексты в `ConfigPanel` из этой задачи.
- DO NOT добавлять новый UI кроме disabled состояния кнопки.

## Acceptance Criteria

- [ ] При смене модели или параметров вызывается backend estimate.
- [ ] Если `can_afford = false`, кнопка генерации заблокирована.
- [ ] Если estimate вернул ошибку поддержки, кнопка генерации заблокирована.
- [ ] Backend не создает `Element`, если debit неуспешен.
- [ ] При terminal provider failure выполняется refund.
- [ ] Повторная failure-обработка не создает двойной refund.
- [ ] После успешного debit/refund frontend balance обновляется.

## Integration Notes

- TASK 10.3 уже показывает пользователю стоимость и причину блокировки.
- Эта задача завершает end-to-end сценарий `estimate -> debit -> generate -> refund`.
