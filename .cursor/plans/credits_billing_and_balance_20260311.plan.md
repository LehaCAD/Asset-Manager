---
name: credits_billing_and_balance
overview: Исполняемый план по внедрению домена credits, пользовательского баланса, оценки стоимости генерации, блокировки запуска при нехватке средств, возвратов и админского управления прайсингом без формул. План фиксирует архитектурные решения, границы файлов и безопасный порядок реализации.
todos:
  - id: credits-0-contracts
    content: Фаза 0. Зафиксировать контракты credits, pricing schema, API responses и архитектурные правила.
    status: pending
  - id: credits-1-backend
    content: Фаза 1. Реализовать backend credits domain, persistence, estimate API и transaction journal.
    status: pending
  - id: credits-2-admin
    content: Фаза 2. Добавить в админку управление балансом пользователя и pricing schema моделей.
    status: pending
  - id: credits-3-frontend
    content: Фаза 3. Реализовать frontend credits store, Navbar balance и отображение стоимости в ConfigPanel.
    status: pending
  - id: credits-4-integration
    content: Фаза 4. Встроить списание и возвраты в generate flow и заблокировать PromptBar при невозможности генерации.
    status: pending
isProject: false
---

# Credits Billing And Balance Plan

## Зафиксированные решения

- В проекте появляется отдельный домен `credits`.
- Формулы запрещены. Цена задается только:
  - `fixed_cost`;
  - `cost_params + costs`.
- Если `pricing_schema` отсутствует, это ошибка конфигурации, а не бесплатная генерация.
- Если комбинация параметров не найдена, пользователь получает русскую ошибку поддержки.
- Пользовательская цена считается как `base_cost * pricing_percent / 100`.
- Баланс пользователя отображается в `Navbar` рядом с переключателем темы.
- В `ConfigPanel` показывается только стоимость и причина недоступности генерации.
- Кнопка `Сгенерировать` просто блокируется, без текста возле кнопки.
- При ошибке провайдера выполняется возврат пользователю.
- Все тексты в UI и API должны быть на русском языке.

## Текущее состояние, которое нельзя игнорировать

- `backend/apps/scenes/views.py` сейчас запускает генерацию без денежной проверки.
- `backend/apps/elements/tasks.py` умеет переводить элемент в success или failure, но не знает ничего о возвратах.
- `backend/apps/ai_providers/models.py` хранит `parameters_schema`, но не хранит правила ценообразования.
- `backend/apps/users/models.py` содержит `UserQuota`, но не содержит баланса и пользовательского процентного модификатора цены.
- `frontend/components/layout/Navbar.tsx` уже имеет стабильную правую зону с `ThemeToggle` и аватаром, куда удобно добавить баланс.
- `frontend/components/generation/ConfigPanel.tsx` уже привязан к выбранной модели и параметрам, поэтому это естественное место для отображения стоимости.
- `frontend/lib/store/generation.ts` уже собирает `generation_config`, поэтому должен стать потребителем estimate-логики, а не местом для локального расчета цены.

## Безопасный порядок выполнения

1. Фаза 0. Контракты и архитектурные решения.
2. Фаза 1. Backend credits domain и API.
3. Фаза 2. Админка пользователя и модели.
4. Фаза 3. Frontend state и UI.
5. Фаза 4. Интеграция generate flow, дебет и refund.

Это именно порядок реализации. Поздние фазы не должны самостоятельно придумывать shape данных или тексты ошибок.

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

| Round | Tasks | Почему можно параллелить |
|-------|-------|---------------------------|
| 1 | `TASK_10_0` | Фиксирует все общие контракты |
| 2 | `TASK_10_1`, `TASK_10_2`, `TASK_10_3` | После контрактов backend, admin и frontend почти не конфликтуют |
| 3 | `TASK_10_4` | Интегрирует уже готовые доменные и UI-части |

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

- `W` — владеет файлом и может менять;
- `r` — только читает;
- пусто — не трогает.

## Фаза 0. Contracts & Architecture Lock

Цель:

- зафиксировать названия полей, response shape и правила ошибок;
- не дать backend и frontend придумывать разные статусы и тексты;
- закрепить запрет на формулы и fallback pricing.

Нужно зафиксировать без вариантов:

- денежные значения в API возвращаются строками;
- `pricing_percent` хранится как целый процент;
- `estimate` и `generate` используют одну бизнес-логику;
- отсутствующий или пустой `pricing_schema` всегда означает ошибку поддержки;
- неизвестная комбинация параметров не приводит к max fallback;
- `refund` идемпотентен для одной генерации;
- UI-ошибки выводятся только на русском языке.

## Фаза 1. Backend Credits Domain & API

Цель:

- создать backend-контур credits с атомарным debit/refund;
- добавить оценку стоимости;
- сохранить аудит операций.

Внутри фазы должны появиться:

- `CreditsTransaction`;
- result-объекты для estimate/debit/refund;
- проверка конфигурации модели;
- `balance` endpoint;
- `estimate` endpoint;
- миграции.

Запреты:

- не смешивать доменную логику credits с кодом `SceneViewSet`;
- не дублировать ценообразование в нескольких местах;
- не использовать `float`.

## Фаза 2. Admin Pricing & Balance Controls

Цель:

- сделать админку пригодной для реального ручного управления балансом и pricing schema.

Внутри фазы должны появиться:

- баланс и процент в админке пользователя;
- понятные help text для fixed pricing и lookup pricing;
- удобное отображение истории транзакций;
- безопасное редактирование без формул.

Запреты:

- не придумывать отдельный UI-конструктор формул;
- не прятать важные денежные поля глубоко в collapse-секции;
- не менять доменную логику credits.

## Фаза 3. Frontend Credits State & UI

Цель:

- показать баланс в глобальной шапке;
- показать стоимость и причину в `ConfigPanel`;
- централизовать загрузку balance/estimate в отдельном store.

Внутри фазы должны появиться:

- `credits` API module;
- `credits` store;
- баланс в `Navbar`;
- стоимость и русские ошибки в `ConfigPanel`.

Запреты:

- не считать цену на клиенте;
- не показывать баланс в `ConfigPanel`;
- не добавлять текст возле кнопки генерации.

## Фаза 4. Generation Debit / Refund Integration

Цель:

- встроить банковский контур в generate flow без расхождения с UI.

Внутри фазы должны появиться:

- вызов estimate при смене модели и параметров;
- блокировка `PromptBar` при `can_afford = false`;
- debit до создания `Element`;
- refund при failure;
- обновление frontend balance после успешного списания и возврата.

Запреты:

- не запускать генерацию при ошибке estimate;
- не делать двойной refund;
- не блокировать кнопку по локально вычисленной цене.

## Acceptance Criteria для всего плана

- [ ] Пользователь видит баланс в `Navbar`.
- [ ] Пользователь видит стоимость в `ConfigPanel`.
- [ ] Кнопка `Сгенерировать` блокируется, если credits-сервис вернул `can_afford = false`.
- [ ] Пустой `pricing_schema` приводит к русской ошибке поддержки.
- [ ] Неизвестная комбинация параметров приводит к русской ошибке поддержки.
- [ ] При ошибке провайдера выполняется возврат средств.
- [ ] Все операции записываются в журнал транзакций.
- [ ] Баланс можно менять из админки.
- [ ] Процент пользователя влияет на цену.
- [ ] В кодовой базе нет формульного ценообразования.
