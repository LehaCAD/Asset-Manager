# Усиление промпта — спецификация

## Суть

Галочка «Усилить промпт» над PromptBar. Если включена — при генерации бэкенд автоматически пропускает промпт через текстовую LLM (GPT-4o-mini, DeepSeek, Claude Haiku — настраивается в админке). Короткие промпты дополняются, длинные остаются как есть. Пользователь не видит промежуточного результата — смотрит итог в DetailPanel.

Фича гейтится подпиской: доступна с плана `creator_pro` через существующий код `ai_prompt`.

## Архитектура

### Новый модуль: `backend/apps/ai_services/`

Изолированный Django-app для внутренних AI-сервисов платформы. Не пересекается с `ai_providers` (который про асинхронную генерацию изображений/видео с polling и callback). `ai_services` — про синхронные запросы к текстовым LLM.

```
backend/apps/ai_services/
├── models.py          # LLMProvider, AIService
├── clients/
│   ├── base.py        # BaseLLMClient — абстрактный интерфейс
│   ├── openai_compat.py  # OpenAI-совместимый (OpenAI, DeepSeek, Groq, Together, Gemini)
│   └── anthropic.py   # Anthropic Claude
├── services/
│   └── prompt_enhance.py  # enhance_prompt() — бизнес-логика усиления
├── admin.py           # Админка с тестовой кнопкой
├── urls.py            # (пусто — нет публичных эндпоинтов, вызывается из orchestration)
├── apps.py
└── tests/
```

### Модели данных

#### LLMProvider

| Поле | Тип | Описание |
|------|-----|----------|
| `name` | CharField | Отображаемое имя ("OpenAI", "Anthropic") |
| `provider_type` | CharField choices | `openai_compatible` \| `anthropic` |
| `api_base_url` | URLField | Базовый URL (`https://api.openai.com`, `https://api.anthropic.com`) |
| `api_key` | CharField | API-ключ (шифрование через `django-fernet-fields` или хранение в env с ссылкой) |
| `is_active` | BooleanField | Активен ли провайдер |
| `created_at` | DateTimeField | auto_now_add |

#### AIService

| Поле | Тип | Описание |
|------|-----|----------|
| `service_type` | CharField choices | `PROMPT_ENHANCE` \| `SMART_EDIT` \| ... (расширяемый) |
| `name` | CharField | Отображаемое имя для админки |
| `provider` | ForeignKey(LLMProvider) | Провайдер |
| `model_name` | CharField | Идентификатор модели ("gpt-4o-mini", "deepseek-chat") |
| `system_prompt` | TextField | Системный промпт для LLM |
| `parameters` | JSONField | `{temperature, max_tokens, top_p}` — универсальные параметры |
| `cost_per_call` | DecimalField | Стоимость одного вызова в кадрах для пользователя |
| `is_active` | BooleanField | Активен ли сервис |
| `created_at` | DateTimeField | auto_now_add |

**Constraint:** Максимум один активный сервис на каждый `service_type`. Админка показывает предупреждение при попытке активировать второй.

### LLM-клиенты

Общий интерфейс:

```python
class BaseLLMClient(ABC):
    @abstractmethod
    def chat(self, system_prompt: str, user_message: str, params: dict) -> LLMResponse:
        """Синхронный вызов LLM. Возвращает текст ответа."""
        ...

@dataclass
class LLMResponse:
    text: str
    prompt_tokens: int
    completion_tokens: int
```

**OpenAICompatibleClient:**
- POST `{base_url}/v1/chat/completions`
- system prompt → `messages[0].role = "system"`
- Ответ → `choices[0].message.content`
- Покрывает: OpenAI, DeepSeek, Groq, Together, Gemini (через совместимый эндпоинт)

**AnthropicClient:**
- POST `{base_url}/v1/messages`
- system prompt → top-level `system` параметр
- `max_tokens` — обязателен
- Ответ → `content[0].text`

### Сервис усиления: `prompt_enhance.py`

```python
@dataclass
class EnhanceResult:
    prompt: str           # Финальный промпт (усиленный или оригинальный)
    was_enhanced: bool     # Было ли усиление (или промпт оставлен как есть)
    cost: Decimal         # Стоимость в кадрах (0 если не усиливалось)

def enhance_prompt(original_prompt: str, user) -> EnhanceResult:
    """
    1. Найти активный AIService(PROMPT_ENHANCE)
       — если нет → вернуть оригинал, was_enhanced=False, cost=0
    2. Проверить has_feature(user, 'ai_prompt')
       — если нет → вернуть оригинал
    3. Отправить промпт в LLM (system_prompt из AIService)
       — LLM сама решает: усилить или вернуть как есть (инструкция в system prompt)
    4. Дебетировать cost_per_call через CreditsService
    5. Вернуть EnhanceResult
    """
```

**Обработка ошибок:** Если LLM-вызов падает (таймаут, ошибка API) — генерация продолжается с оригинальным промптом. Ошибка логируется, но не блокирует генерацию. Стоимость не списывается.

**Системный промпт (дефолтный, редактируется в админке):**

```
You are a prompt enhancement assistant for an AI image/video generation platform.

Your task:
- If the user's prompt is short or vague (under ~30 words), expand it into a detailed, high-quality generation prompt
- If the prompt is already detailed and specific, return it unchanged
- Preserve the original language (Russian or English)
- Add relevant details: style, lighting, composition, mood, camera angle, quality descriptors
- Do NOT change the core subject or intent
- Output ONLY the final prompt text, no explanations or prefixes
```

## Интеграция с генерацией

### orchestration.py — точка вызова

В `create_generation()` добавляется шаг перед созданием Element:

```python
# В create_generation(), после валидации, перед debit:
enhanced_prompt = original_prompt
enhance_cost = Decimal("0")
was_enhanced = False

if generation_config.pop("enhance_prompt", False):
    from apps.ai_services.services.prompt_enhance import enhance_prompt
    result = enhance_prompt(original_prompt, user)
    enhanced_prompt = result.prompt
    enhance_cost = result.cost
    was_enhanced = result.was_enhanced

# Element создаётся с original_prompt в prompt_text
# enhanced_prompt и enhance_cost сохраняются в generation_config
```

### Хранение в Element

```python
Element:
    prompt_text = "хочу котика"  # Всегда оригинальный промпт пользователя
    generation_config = {
        # ... параметры модели ...
        "enhanced_prompt": "A cute fluffy orange tabby kitten...",  # Если было усиление
        "prompt_enhanced": True,                                      # Флаг
        "enhance_cost": "1.00",                                       # Стоимость в кадрах
    }
```

### tasks.py — подстановка промпта

В `start_generation()` при сборке контекста для request_schema:

```python
# Если есть enhanced_prompt — подставляем его вместо оригинального
prompt_for_provider = generation_config.get("enhanced_prompt", element.prompt_text)
# Подставляется в {{prompt}} плейсхолдер request_schema
```

## Frontend

### PromptBar — галочка над баром

Над существующим PromptBar добавляется pill-контейнер с галочкой:

```tsx
{/* Pill-контейнер для фич (над PromptBar) */}
<div className="flex items-center gap-2 px-1 mb-2">
  <FeatureGate feature="ai_prompt" inline>
    <label className="flex items-center gap-1.5 cursor-pointer">
      <Checkbox
        checked={enhancePrompt}
        onCheckedChange={setEnhancePrompt}
        className="h-3.5 w-3.5"
      />
      <span className="text-xs text-muted-foreground">Усилить промпт</span>
      <Tooltip content="Короткие промпты будут автоматически дополнены. Детальные останутся как есть.">
        <Info className="h-3.5 w-3.5 text-muted-foreground/50" />
      </Tooltip>
    </label>
  </FeatureGate>
</div>
```

**FeatureGate с `inline` prop:** Не оборачивает в overlay, а рендерит как disabled + PRO-бейдж рядом. Клик открывает UpgradeModal.

**Состояние `enhancePrompt`:** Хранится в `useGenerationStore`. Передаётся в `generation_config` при вызове `generate()`:

```typescript
// В generate():
const payload = {
  prompt,
  ai_model_id: selectedModel.id,
  generation_config: {
    ...parameterValues,
    ...imageInputValues,
    enhance_prompt: enhancePrompt,  // ← новый флаг
  },
};
```

### DetailPanel — отображение

В секции «Информация»:
- Если `generation_config.prompt_enhanced === true` — добавить строку «Усиление промпта: {enhance_cost} ₽» (форматируется через `formatCurrency` с иконкой кадра)

В секции «Промпт»:
- Если `prompt_enhanced === true` — показать бейдж «✦ Усилен» рядом с заголовком
- Textarea показывает `enhanced_prompt` (то, что было отправлено провайдеру)
- «Повторить запрос» → подставляет `enhanced_prompt` в PromptBar

Ключ `enhance_cost` добавляется в `HIDDEN_CONFIG_KEYS` чтобы не дублировался в секции «Параметры». То же для `enhanced_prompt` и `prompt_enhanced`.

### Generation Store

Новое состояние:
```typescript
interface GenerationState {
  // ... существующее ...
  enhancePrompt: boolean;
  setEnhancePrompt: (value: boolean) => void;
}
```

Значение по умолчанию: `false`. Персистится в `localStorage` чтобы пользователь не включал каждый раз.

## Подписки

Используется существующая инфраструктура без изменений:
- Feature code: `ai_prompt` (уже зарегистрирован)
- План: `creator_pro` (уже привязан)
- Backend: `feature_required('ai_prompt')` — не нужен отдельный эндпоинт, проверка в `enhance_prompt()`
- Frontend: `<FeatureGate feature="ai_prompt">` — оборачивает галочку

## Админка

### LLMProvider — список провайдеров

Компактный list_display: имя, тип, URL (обрезанный), статус (цветной бейдж).

### AIService — карточка сервиса

Fieldsets:
1. **Основное** — service_type (read-only после создания), name, provider (dropdown), model_name, is_active
2. **Системный промпт** — textarea с monospace шрифтом, полная ширина
3. **Параметры** — temperature (slider/input), max_tokens (input), top_p (input)
4. **Стоимость** — cost_per_call в кадрах

**Кнопка «Протестировать»:** Кастомный action в change_form. Принимает тестовый промпт, вызывает `enhance_prompt()`, показывает результат (оригинал → усиленный, токены, время).

## Стоимость

- Списание в кадрах через существующий `CreditsService`
- `cost_per_call` задаётся в админке на AIService
- Списание происходит в `enhance_prompt()` после успешного LLM-вызова
- Отображается в DetailPanel как отдельная строка в метаданных
- При ошибке LLM — стоимость не списывается, генерация продолжается с оригинальным промптом

## Границы модуля

### ai_services знает о:
- `CreditsService` (для дебита стоимости)
- `SubscriptionService` (для проверки `has_feature`)

### ai_services НЕ знает о:
- `Element`, `Scene`, `Project` — не импортирует, не зависит
- `ai_providers` — полностью изолирован
- Frontend-компонентах — только generation_config передаёт данные

### Точки интеграции (3 штуки):
1. **orchestration.py** — вызывает `enhance_prompt()` перед созданием Element
2. **tasks.py** — читает `enhanced_prompt` из generation_config при подстановке в request_schema
3. **Frontend: generation store** — передаёт флаг `enhance_prompt` в payload

## Что НЕ входит в скоуп

- Smart Edit (вторая фича — отдельная спека)
- Streaming ответов LLM
- Кеширование усиленных промптов
- Fallback между провайдерами при ошибке
- A/B тестирование разных системных промптов
- Фронтенд для просмотра оригинального промпта (только усиленный в DetailPanel)
