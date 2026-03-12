# Decomposition — Phase 10 Credits

> Master index for credits implementation. Each task is self-contained and executable by an independent agent after contracts are locked.

## Dependency Graph

```text
TASK_10_0 (Contracts & Architecture Lock)
    │
    ├── TASK_10_1 (Backend Credits Domain & API) ───────┐
    ├── TASK_10_2 (Admin Pricing & Balance Controls)    │
    └── TASK_10_3 (Frontend Credits State & UI) ────────┤
                                                         │
                               TASK_10_4 (Generation Debit / Refund Integration)
```

## Execution Rounds

| Round | Tasks | Notes |
|-------|-------|-------|
| 1 | `TASK_10_0` | Обязательная фиксация контрактов |
| 2 | `TASK_10_1`, `TASK_10_2`, `TASK_10_3` | Можно делать параллельно после контрактов |
| 3 | `TASK_10_4` | Финальная интеграция generate flow |

## File Ownership Matrix

```text
File                                              | 10_0 | 10_1 | 10_2 | 10_3 | 10_4
──────────────────────────────────────────────────┼──────┼──────┼──────┼──────┼──────
backend/apps/users/models.py                      |  W   |  W   |  r   |      |  r
backend/apps/ai_providers/models.py               |  W   |  W   |  r   |      |  r
backend/apps/credits/models.py                    |  W   |  W   |  r   |      |  r
backend/apps/credits/services.py                  |  W   |  W   |  r   |      |  r
backend/apps/credits/serializers.py               |  W   |  W   |      |      |  r
backend/apps/credits/views.py                     |  W   |  W   |      |      |  r
backend/apps/credits/urls.py                      |  W   |  W   |      |      |  r
backend/config/urls.py                            |  W   |  W   |      |      |  r
backend/apps/users/admin.py                       |  r   |      |  W   |      |
backend/apps/ai_providers/admin.py                |  r   |      |  W   |      |
frontend/lib/types/index.ts                       |  W   |  r   |      |  r   |  r
frontend/lib/api/credits.ts                       |  W   |      |      |  W   |  r
frontend/lib/store/credits.ts                     |  W   |      |      |  W   |  r
frontend/components/layout/Navbar.tsx             |  r   |      |      |  W   |
frontend/components/generation/ConfigPanel.tsx    |  r   |      |      |  W   |  r
frontend/lib/store/generation.ts                  |  r   |      |      |  r   |  W
frontend/components/generation/PromptBar.tsx      |  r   |      |      |      |  W
backend/apps/scenes/views.py                      |  r   |      |      |      |  W
backend/apps/elements/tasks.py                    |  r   |      |      |      |  W
.cursor/rules/credits-billing-architecture.mdc    |  W   |  r   |  r   |  r   |  r
```

Legend:

- `W` = writes / owns
- `r` = reads only

## Task Index

| Task | File | What it delivers |
|------|------|------------------|
| [TASK_10_0](TASK_10_0_CREDITS_CONTRACTS.md) | Contracts & Architecture Lock | Fields, API types, rule file, error texts |
| [TASK_10_1](TASK_10_1_BACKEND_CREDITS_DOMAIN.md) | Backend Credits Domain & API | Service, transactions, balance, estimate |
| [TASK_10_2](TASK_10_2_ADMIN_PRICING_AND_BALANCE.md) | Admin Pricing & Balance Controls | User/admin controls, pricing_schema editing |
| [TASK_10_3](TASK_10_3_FRONTEND_CREDITS_UI.md) | Frontend Credits State & UI | Balance chip, ConfigPanel cost, credits store |
| [TASK_10_4](TASK_10_4_GENERATION_CREDITS_INTEGRATION.md) | Generation Debit / Refund Integration | Debit before generate, refund on failure, disabled button |

## Locked Decisions

- Формулы запрещены.
- `pricing_schema` обязателен для платных моделей.
- Отсутствующий или сломанный pricing дает ошибку поддержки.
- Неизвестная комбинация параметров не имеет fallback.
- Balance в `Navbar`, стоимость и причина в `ConfigPanel`.
- Кнопка генерации только disabled, без пояснения возле нее.
- Refund обязателен при terminal failure провайдера.
