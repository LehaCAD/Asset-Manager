# Усиление промпта (Prompt Enhance)

> Автоматическое улучшение пользовательского промпта через LLM перед генерацией.
> Последнее обновление: 2026-04-15

## Статус: Реализовано

## Обзор

Пользователь включает тогл «Усилить промпт» над PromptBar. При генерации промпт отправляется на внешний LLM (настраивается в админке), который возвращает улучшенную версию. Улучшенный промпт подставляется в запрос к AI-провайдеру вместо оригинала. Оригинал сохраняется на элементе (`prompt_text`), улучшенный — в `generation_config._enhanced_prompt`.

Стоимость: 1 кадр за вызов (настраивается в админке на AIService).

## Feature gating

Фича `ai_prompt` — доступна с тарифа **Создатель Pro**.

- Backend: `SubscriptionService.has_feature(user, "ai_prompt")` в `prompt_enhance.py:58`
- Frontend: `useFeatureGate('ai_prompt')` в `PromptEnhanceToggle.tsx`
- Тарифы: `creator_pro`, `team`, `enterprise`
- При отсутствии фичи: тогл отображается заблокированным с `TierBadge` + `UpgradeModal`

## Точки входа

| Контекст | Компонент | Действие |
|----------|-----------|----------|
| Генерация в сцене | `PromptBar` → `PromptEnhanceToggle` (`variant="inline"`) | Тогл-чекбокс в футере PromptBar — ниже текстареи и thumbnail-ов, выровнен по левому краю |
| Lightbox | `DetailPanel` | Бейдж «✦ Усилен» + стоимость в метаданных |

## UI

### Тогл (PromptEnhanceToggle)

- Компонент: `frontend/components/generation/PromptEnhanceToggle.tsx`
- Чекбокс 3.5×3.5 + текст «Усилить промпт» + иконка Info с тултипом
- Тултип: «Промпт будет автоматически дополнен и улучшен для лучшего результата генерации.»
- Состояние хранится в Zustand store `generation.enhancePrompt` + `localStorage('enhance_prompt')`
- При заблокированном тарифе: клик открывает `UpgradeModal` с `featureCode="ai_prompt"`

### DetailPanel (Lightbox)

- Если элемент был усилён (`_prompt_enhanced === true`):
  - Бейдж «✦ Усилен» (primary цвет) над промптом
  - В поле промпта отображается `_enhanced_prompt` вместо `prompt_text`
  - В метаданных строка «Усиление промпта: X кадров»

## Полный flow

```
1. Пользователь включает тогл "Усилить промпт"
2. Нажимает "Генерировать"
3. Frontend отправляет POST /api/scenes/{id}/generate/
   body: { prompt, ai_model_id, generation_config: { enhance_prompt: true, ... } }
4. Backend: orchestration.create_generation()
   4a. Pop "enhance_prompt" из config
   4b. Вызов enhance_prompt(prompt, user):
       - Поиск активного AIService (service_type=PROMPT_ENHANCE)
       - Проверка feature gate (has_feature "ai_prompt")
       - Проверка баланса (balance >= cost_per_call)
       - Вызов LLM → парсинг JSON {"enhanced_prompt": "..."}
       - Списание кредитов (REASON_PROMPT_ENHANCEMENT)
   4c. Сохранение в generation_config:
       _enhanced_prompt, _prompt_enhanced, _enhance_cost
5. Celery task: start_generation
   - Берёт config.get("_enhanced_prompt", element.prompt_text)
   - Отправляет улучшенный промпт провайдеру
6. Результат → S3 → WebSocket → карточка в grid
```

## Модели данных

### AIService (backend/apps/ai_services/models.py)

```python
service_type = "PROMPT_ENHANCE"  # единственный активный
provider → LLMProvider           # FK на провайдера
model_name = "openai/gpt-4.1-mini"
system_prompt = "..."            # системный промпт для LLM
parameters = {temperature, max_tokens, top_p, timeout}
cost_per_call = 1.00             # стоимость в кадрах
is_active = True
# UniqueConstraint: один активный сервис на service_type
```

### LLMProvider (backend/apps/ai_services/models.py)

```python
provider_type: "openai_compatible" | "anthropic"
api_base_url: str
api_key: str  # может начинаться с "ENV:" для чтения из env
```

### Feature (backend/apps/subscriptions/models.py)

```python
code = "ai_prompt"
title = "Усиление промпта"
description = "Нейросеть улучшит ваш промпт для более точной и качественной генерации."
icon = "sparkles"
min_plan → Plan("creator_pro")
```

### CreditsTransaction

```python
REASON_PROMPT_ENHANCEMENT = "prompt_enhancement"
# Списание: amount = -cost_per_call
```

## Graceful degradation

Фича спроектирована fail-safe — при любой ошибке возвращается оригинальный промпт без списания:

| Ситуация | Поведение |
|----------|-----------|
| Нет активного AIService | `_noop` — оригинал |
| Нет фичи в тарифе | `_noop` — оригинал |
| Баланс < cost_per_call | `_noop` — оригинал, LLM не вызывается |
| LLM вернул ошибку/timeout | `_noop` — оригинал, логируется exception |
| LLM вернул пустой ответ | `_noop` — оригинал |
| JSON без ключа enhanced_prompt | `_noop` — оригинал |
| LLM вернул plain text (не JSON) | Используется как есть |
| debit_flat не прошёл | `_noop` — оригинал |

## Админка

### LLMProvider (Django Admin)

- Управление провайдерами LLM: имя, тип (openai_compatible/anthropic), URL, API-ключ
- Поддержка `ENV:` prefix для безопасного хранения ключей

### AIService (Django Admin)

- Управление сервисами: тип (PROMPT_ENHANCE/SMART_EDIT), провайдер, модель, системный промпт, параметры, стоимость
- UniqueConstraint: только один активный сервис каждого типа

### Seed-данные (миграция 0002_seed_prompt_enhance)

- Провайдер: **Polza.ai** (openai_compatible, `polza.ai/api/v1`)
- Сервис: **GPT-4.1-mini Enhance** — temperature 0.7, max_tokens 600, timeout 15с

## API

### `POST /api/scenes/{id}/generate/` и `POST /api/projects/{id}/generate/`

Prompt enhance не имеет отдельного endpoint — интегрирован в существующую генерацию.

Request (с усилением):
```json
{
  "prompt": "кот на закате",
  "ai_model_id": 123,
  "generation_config": {
    "enhance_prompt": true,
    "aspect_ratio": "16:9"
  }
}
```

Результат сохраняется в `element.generation_config`:
```json
{
  "_enhanced_prompt": "Величественный рыжий кот...",
  "_prompt_enhanced": true,
  "_enhance_cost": "1.00",
  "aspect_ratio": "16:9"
}
```

Флаг `enhance_prompt` удаляется из config (pop) — не сохраняется.

## Тесты

### Unit-тесты (apps/ai_services/tests/test_prompt_enhance.py) — 11 тестов

**EnhancePromptSuccessTests:**
- `test_enhancement_success` — LLM возвращает JSON → промпт улучшен
- `test_credits_debited_on_success` — баланс уменьшается на cost_per_call
- `test_transaction_created` — создаётся CreditsTransaction
- `test_llm_returns_json_with_enhanced_prompt` — парсинг JSON корректен
- `test_llm_returns_plain_text` — fallback на plain text

**EnhancePromptNoopTests:**
- `test_no_active_service_returns_original` — нет сервиса → оригинал
- `test_no_feature_returns_original` — нет фичи → оригинал
- `test_llm_error_returns_original` — ошибка LLM → оригинал
- `test_llm_error_no_debit` — при ошибке баланс не трогается
- `test_llm_returns_empty_uses_original` — пустой ответ → оригинал
- `test_insufficient_credits_skips_llm` — нет денег → LLM не вызывается

### Интеграционные тесты (apps/elements/tests.py) — 3 теста

- `test_enhance_prompt_flag_triggers_enhancement` — флаг → вызов enhance
- `test_no_enhance_flag_skips_enhancement` — без флага → без enhance
- `test_enhance_flag_removed_from_config` — флаг удаляется из config

> **Примечание:** интеграционные тесты в `apps/elements/tests.py` не запускаются через `manage.py test apps.elements.tests` из-за конфликта с директорией `apps/elements/tests/`. Запускать через `manage.py test apps.elements.tests.OrchestrationEnhancePromptTests` напрямую нельзя — нужен рефакторинг структуры тестов (переименовать `tests.py` или `tests/`).

## Файлы

```
backend/
├── apps/ai_services/
│   ├── models.py                          — AIService, LLMProvider
│   ├── admin.py                           — AIServiceAdmin, LLMProviderAdmin
│   ├── services/prompt_enhance.py         — enhance_prompt(), _call_llm(), _noop()
│   ├── clients/
│   │   ├── anthropic.py                   — AnthropicClient
│   │   └── openai_compat.py               — OpenAICompatClient
│   ├── migrations/0002_seed_prompt_enhance.py — seed Polza.ai + GPT-4.1-mini
│   └── tests/test_prompt_enhance.py       — 11 unit-тестов
├── apps/elements/
│   ├── orchestration.py:52-65             — интеграция enhance в create_generation()
│   ├── tasks.py:84-86                     — использование _enhanced_prompt в Celery task
│   └── tests.py:180-304                   — 3 интеграционных теста
├── apps/credits/
│   ├── models.py:19,32                    — REASON_PROMPT_ENHANCEMENT
│   └── migrations/0006_...                — добавление reason в choices
├── apps/subscriptions/
│   ├── models.py                          — Feature(code="ai_prompt"), Plan, Subscription
│   ├── services.py:54-57                  — has_feature()
│   └── migrations/0002_seed_plans.py      — seed фичи ai_prompt + привязка к тарифам

frontend/
├── components/
│   ├── generation/
│   │   ├── PromptEnhanceToggle.tsx        — тогл-чекбокс + feature gate + upgrade modal
│   │   └── PromptBar.tsx:253              — рендер PromptEnhanceToggle
│   ├── lightbox/
│   │   └── DetailPanel.tsx:75-81,167-173,288-291 — отображение усилённого промпта + бейдж
│   └── subscription/
│       ├── TierBadge.tsx:16               — mapping ai_prompt → "pro"
│       └── UpgradeModal.tsx               — модалка апгрейда
├── lib/
│   ├── store/generation.ts:45,88-90,219-224,343 — enhancePrompt state + localStorage
│   ├── hooks/useFeatureGate.ts            — хук проверки feature gate
│   └── store/subscription.ts              — hasFeature()
```

## Ограничения

- Вызов LLM **синхронный** внутри `create_generation()` — добавляет ~1-3 сек к генерации
- Один активный сервис на тип (UniqueConstraint) — нельзя A/B тестировать провайдеров
- Нет UI-индикации «промпт усиливается...» во время ожидания LLM-ответа
- Нет истории усилений — только последний результат в generation_config

## Backlog

- Loading state «Усиляем промпт...» в UI перед стартом генерации
- Предпросмотр усилённого промпта перед генерацией (confirm/edit)
- A/B тестирование разных LLM-провайдеров для enhance
- Асинхронный enhance через Celery (убрать задержку из синхронного flow)
- Рефакторинг тестов: устранить конфликт `tests.py` / `tests/` в apps/elements
