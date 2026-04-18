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
| `api_key` | CharField | API-ключ. Хранится plain text (видно только админу). Для прода: можно указать `ENV:OPENAI_API_KEY` — резолвится в `os.environ` при инициализации клиента |
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

**Constraint:** Максимум один активный сервис на каждый `service_type`. Enforced через `UniqueConstraint` с `condition=Q(is_active=True)` (partial unique index в PostgreSQL). Админка показывает ошибку при попытке активировать второй.

### LLM-клиенты

Общий интерфейс:

```python
class BaseLLMClient(ABC):
    DEFAULT_TIMEOUT = 15  # секунд — жёсткий лимит для синхронного вызова из view

    @abstractmethod
    def chat(self, system_prompt: str, user_message: str, params: dict,
             timeout: int = DEFAULT_TIMEOUT) -> LLMResponse:
        """Синхронный вызов LLM. Возвращает текст ответа.
        Timeout: requests.post(..., timeout=timeout). При превышении — raise."""
        ...

@dataclass
class LLMResponse:
    text: str
    prompt_tokens: int
    completion_tokens: int
```

**Таймаут:** 15 секунд по умолчанию. Переопределяется через `AIService.parameters.timeout`. Усиление выполняется синхронно внутри `create_generation()` — это Django view, пользователь ждёт ответа. При таймауте генерация продолжается с оригинальным промптом (graceful degradation).

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
#
# 1. Извлечь и удалить флаг enhance_prompt из generation_config
#    (чтобы он не попал в request_schema контекст провайдера)
enhance_requested = generation_config.pop("enhance_prompt", False)

enhanced_prompt = original_prompt
enhance_cost = Decimal("0")
was_enhanced = False

if enhance_requested:
    from apps.ai_services.services.prompt_enhance import enhance_prompt
    result = enhance_prompt(original_prompt, user)
    enhanced_prompt = result.prompt
    enhance_cost = result.cost
    was_enhanced = result.was_enhanced

# 2. Сохранить результат в generation_config с префиксом _
#    (конвенция для системных метаданных: _debit_amount, _debit_transaction)
if was_enhanced:
    generation_config["_enhanced_prompt"] = enhanced_prompt
    generation_config["_prompt_enhanced"] = True
    generation_config["_enhance_cost"] = str(enhance_cost)

# 3. Element создаётся с:
#    - prompt_text = original_prompt (оригинал пользователя)
#    - generation_config содержит _enhanced_prompt (если было усиление)
```

### Хранение в Element

```python
Element:
    prompt_text = "хочу котика"  # Всегда оригинальный промпт пользователя
    generation_config = {
        # ... параметры модели ...
        # Системные ключи с префиксом _ (не попадают в ConfigPanel, retryFromElement, provider context):
        "_enhanced_prompt": "A cute fluffy orange tabby kitten...",  # Усиленный промпт
        "_prompt_enhanced": True,                                      # Флаг — было ли усиление
        "_enhance_cost": "1.00",                                       # Стоимость в кадрах
        "_debit_amount": "12.50",                                      # Стоимость генерации (existing)
        "_debit_transaction": 42,                                      # ID транзакции (existing)
    }
```

Ключи с `_` автоматически скрыты: `HIDDEN_CONFIG_KEYS` в DetailPanel, `retryFromElement` в generation store, `build_generation_context` пропускает при подстановке.

### tasks.py — подстановка промпта

В `start_generation()`, перед вызовом `build_generation_context()`:

```python
# Извлечь усиленный промпт, если был. Иначе — оригинальный.
config = element.generation_config or {}
prompt_for_provider = config.get("_enhanced_prompt", element.prompt_text) or ""

# Передать как prompt= в build_generation_context:
context = build_generation_context(
    ai_model,
    prompt=prompt_for_provider,       # ← усиленный или оригинальный
    generation_config=config,
    callback_url=callback_url,
)
# Дальше context подставляется в request_schema через {{prompt}} — без изменений
```

**Важно:** `build_generation_context()` принимает `prompt=` как аргумент и кладёт в `context["prompt"]`, который подставляется в `{{prompt}}` плейсхолдер. Ключ `_enhanced_prompt` в generation_config НЕ матчит никакой плейсхолдер и безвредно игнорируется.

## Frontend

### PromptBar — галочка над баром

Над существующим PromptBar добавляется pill-контейнер с галочкой:

```tsx
{/* Pill-контейнер для фич (над PromptBar) */}
<div className="flex items-center gap-2 px-1 mb-2">
  <PromptEnhanceToggle />
</div>
```

**PromptEnhanceToggle** — отдельный компонент (`components/generation/PromptEnhanceToggle.tsx`):

```tsx
function PromptEnhanceToggle() {
  const { enhancePrompt, setEnhancePrompt } = useGenerationStore();
  const hasFeature = useSubscriptionStore((s) => s.hasFeature("ai_prompt"));
  const [showUpgrade, setShowUpgrade] = useState(false);

  if (!hasFeature) {
    // Заблокировано: disabled чекбокс + PRO бейдж, клик → UpgradeModal
    return (
      <>
        <label className="flex items-center gap-1.5 cursor-pointer opacity-50"
               onClick={() => setShowUpgrade(true)}>
          <Checkbox disabled checked={false} className="h-3.5 w-3.5" />
          <span className="text-xs text-muted-foreground">Усилить промпт</span>
          <ProBadge />
        </label>
        <UpgradeModal feature="ai_prompt" open={showUpgrade} onClose={() => setShowUpgrade(false)} />
      </>
    );
  }

  return (
    <label className="flex items-center gap-1.5 cursor-pointer">
      <Checkbox checked={enhancePrompt} onCheckedChange={setEnhancePrompt} className="h-3.5 w-3.5" />
      <span className="text-xs text-muted-foreground">Усилить промпт</span>
      <Tooltip content="Короткие промпты будут автоматически дополнены. Детальные останутся как есть.">
        <Info className="h-3.5 w-3.5 text-muted-foreground/50" />
      </Tooltip>
    </label>
  );
}
```

Используются существующие `ProBadge` и `UpgradeModal` без модификации `FeatureGate`.

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
- Если `generation_config._prompt_enhanced === true` — добавить строку «Усиление промпта: {_enhance_cost}» (форматируется через `formatCurrency` с иконкой кадра)

В секции «Промпт»:
- Если `_prompt_enhanced === true` — показать бейдж «✦ Усилен» рядом с заголовком
- Textarea показывает `_enhanced_prompt` (то, что было отправлено провайдеру)

**«Повторить запрос»:** Подставляет `element.prompt_text` (оригинальный промпт пользователя) в PromptBar. Это текущее поведение `retryFromElement` — не меняется. Если галочка «Усилить промпт» включена — промпт будет усилен заново. Это правильно: пользователь хочет повторить свой запрос, а не копировать предыдущий усиленный промпт (иначе будет рекурсивное усиление).

Ключи `_enhanced_prompt`, `_prompt_enhanced`, `_enhance_cost`:
- В `retryFromElement` — автоматически скрыты (существующая проверка `key.startsWith("_")`)
- В `configParams` (секция «Параметры» DetailPanel) — **нужно добавить** в `HIDDEN_CONFIG_KEYS` set, либо добавить `key.startsWith("_")` guard в фильтр `configParams`. Текущий фильтр использует только `HIDDEN_CONFIG_KEYS.has(key)`, без `startsWith` проверки.

### Generation Store

Новое состояние:
```typescript
interface GenerationState {
  // ... существующее ...
  enhancePrompt: boolean;
  setEnhancePrompt: (value: boolean) => void;
}
```

Значение по умолчанию: `false`. Персистится в `localStorage` через ручное чтение/запись:

```typescript
// В create():
enhancePrompt: typeof window !== 'undefined'
  ? localStorage.getItem('enhance_prompt') === 'true'
  : false,
setEnhancePrompt: (value) => {
  set({ enhancePrompt: value });
  localStorage.setItem('enhance_prompt', String(value));
},
```

## Подписки

Используется существующая инфраструктура без изменений:
- Feature code: `ai_prompt` (уже зарегистрирован)
- План: `creator_pro` (уже привязан)
- Backend: проверка `has_feature(user, 'ai_prompt')` внутри `enhance_prompt()` — не нужен отдельный эндпоинт
- Frontend: `PromptEnhanceToggle` использует `useSubscriptionStore().hasFeature("ai_prompt")` напрямую (без `FeatureGate`)

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

- Списание в кадрах через `CreditsService`
- **Новый метод:** `CreditsService.debit_flat(user, amount, reason, element=None)` — списание фиксированной суммы (не привязанной к AIModel pricing). Создаёт `CreditsTransaction` с `reason="prompt_enhancement"`. Новая константа `"prompt_enhancement"` добавляется в `REASON_CHOICES` модели `CreditsTransaction`.
- `cost_per_call` задаётся в админке на AIService
- Списание происходит в `enhance_prompt()` после успешного LLM-вызова
- Отображается в DetailPanel как отдельная строка в метаданных
- При ошибке LLM — стоимость не списывается, генерация продолжается с оригинальным промптом
- **Два дебита не атомарны:** Усиление и генерация списываются отдельно. Если генерация падёт на этапе дебита (нехватка кадров) — усиление уже оплачено. Это корректно: LLM-вызов был выполнен, ресурс потрачен. Пользователь видит усиленный промпт в DetailPanel и может повторить генерацию

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
- Отдельное отображение оригинального промпта в DetailPanel (показывается только усиленный; оригинальный доступен через «Повторить запрос»)
- Модификация `FeatureGate` компонента (используем отдельный `PromptEnhanceToggle`)
- Новые типы в `types/index.ts` (ключи в `generation_config` — `Record<string, unknown>`, доступ через string keys)
