# TASK 10.3: Frontend Credits State & UI

> **Goal**: Добавить frontend credits store, загрузку баланса, расчет estimate через backend и отображение баланса/стоимости в `Navbar` и `ConfigPanel`.

## Depends On

- [ ] TASK 10.0: Credits Contracts & Architecture Lock

## File Ownership

### Creates (new files)

- `frontend/lib/api/credits.ts` — API-клиент для balance и estimate.
- `frontend/lib/store/credits.ts` — Zustand store баланса и стоимости.

### Modifies (existing files)

- `frontend/components/layout/Navbar.tsx` — отобразить баланс рядом с `ThemeToggle`.
- `frontend/components/generation/ConfigPanel.tsx` — показать стоимость и причину недоступности генерации.

### Reads (does NOT modify)

- `frontend/lib/types/index.ts` — credits response types.
- `frontend/lib/store/generation.ts` — selectedModel и parameters, без модификации на этой задаче.
- `.cursor/rules/credits-billing-architecture.mdc` — обязательные правила.

## Contracts

### API module contract

```typescript
export const creditsApi = {
  getBalance: async (): Promise<CreditsBalanceResponse> => { /* ... */ },
  estimate: async (payload: CreditsEstimateRequest): Promise<CreditsEstimateResponse> => { /* ... */ },
};
```

### Store contract

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

### UI copy

```text
Баланс
Стоимость
Недостаточно средств для генерации.
Не удалось определить стоимость генерации. Обратитесь в поддержку.
```

## Required Imports

```typescript
import { create } from "zustand";
import { toast } from "sonner";
import { creditsApi } from "@/lib/api/credits";
import type {
  CreditsBalanceResponse,
  CreditsEstimateRequest,
} from "@/lib/types";
```

## Implementation Details

- В `credits.ts` добавь:
  - `GET /api/credits/balance/`;
  - `POST /api/credits/estimate/`.
- В `credits` store:
  - храни balance snapshot и последний estimate result;
  - не считай цену локально;
  - при ошибке balance показывай короткий русский toast.
- В `Navbar.tsx`:
  - поставь компактный чип между `ThemeToggle` и аватаром;
  - формат: `50 кр.`;
  - на пустом состоянии показывай `0 кр.` без лишних skeleton.
- В `ConfigPanel.tsx`:
  - показывай `Стоимость: X кр.` при наличии estimate;
  - показывай `estimateError`, если backend вернул причину;
  - не показывай balance;
  - не меняй логику выбора модели и параметров.

## Constraints

- DO NOT вычислять цену на фронтенде.
- DO NOT добавлять тексты возле кнопки генерации.
- DO NOT показывать balance в `ConfigPanel`.
- DO NOT менять `PromptBar.tsx` в этой задаче.
- DO NOT использовать английские тексты.

## Acceptance Criteria

- [ ] Создан `frontend/lib/api/credits.ts`.
- [ ] Создан `frontend/lib/store/credits.ts`.
- [ ] В `Navbar` отображается компактный баланс рядом с темой.
- [ ] В `ConfigPanel` отображается стоимость.
- [ ] В `ConfigPanel` отображается русская причина, если estimate недоступен.
- [ ] UI не содержит локального расчета стоимости.

## Integration Notes

- TASK 10.4 должен вызывать `estimateGeneration()` при изменении модели и параметров.
- После debit/refund TASK 10.4 должен обновлять store через `applyBalanceSnapshot()` или `loadBalance()`.
