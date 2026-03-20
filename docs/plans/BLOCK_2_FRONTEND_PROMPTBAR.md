# Блок 2: Фронтенд — промпт-бар и выбор медиа

> Задачи из agent-tasks.md: #1 (фронтенд-часть), #8 (Статика)
> Зависимости: Блок 1 (API контракт для image_inputs_schema с modes)
> Область: только `frontend/`. Бэкенд НЕ трогать.

## Цель

Реализовать на фронте логику выбора режима медиа для моделей с несколькими режимами (VEO-стиль). Для моделей с одним режимом или без режимов — поведение не меняется.

---

## Контракт данных (из Блока 1)

`image_inputs_schema` приходит из API в двух форматах:

**Формат 1 — плоский список (текущий):**
```json
[{"key": "style_ref", "label": "Style Ref", "min": 0, "max": 4}]
```
Поведение: как сейчас, кнопки в PromptBar.

**Формат 2 — объект с режимами (новый):**
```json
{
  "modes": [
    {
      "key": "first_frame",
      "label": "Начальный кадр",
      "description": "Выберите один кадр для начала видео",
      "icon": "play-circle",
      "slots": [{"key": "first_frame_image", "label": "Начальный кадр", "min": 1, "max": 1, "required": true}],
      "extra_params": {"generationType": "FIRST_FRAME"}
    }
  ],
  "default_mode": "first_frame"
}
```
Поведение: попап выбора режима → затем модалка выбора изображений.

---

## Шаг 1: Типы

**Файл:** `frontend/lib/types/index.ts`

Добавить типы:

```typescript
// Новый формат image_inputs_schema
interface ImageInputMode {
  key: string
  label: string
  description?: string
  icon?: string  // lucide icon name
  slots: ImageInputSchemaItem[]
  extra_params?: Record<string, unknown>
}

interface ImageInputModesSchema {
  modes: ImageInputMode[]
  default_mode?: string
}

// Union type для image_inputs_schema
type ImageInputsSchema = ImageInputSchemaItem[] | ImageInputModesSchema

// Helper type guard
function isModesSchema(schema: ImageInputsSchema): schema is ImageInputModesSchema
```

Обновить тип `AIModel`:
```typescript
image_inputs_schema: ImageInputsSchema  // вместо ImageInputSchemaItem[]
```

---

## Шаг 2: Обновить generation store

**Файл:** `frontend/lib/store/generation.ts`

Добавить в state:
```typescript
// Текущий выбранный режим (если модель поддерживает modes)
selectedMode: ImageInputMode | null
```

Обновить `selectModel(model)`:
- Если `image_inputs_schema` — формат с modes:
  - Установить `selectedMode` = mode с ключом `default_mode` (или первый)
  - Инициализировать imageInputs из `selectedMode.slots`
- Если плоский список — как сейчас, `selectedMode = null`

Добавить action:
```typescript
selectMode(modeKey: string): void
// Меняет selectedMode, пересобирает imageInputs из slots нового режима
```

При `generate()` — если есть `selectedMode.extra_params`, добавить их в `generation_config`.

---

## Шаг 3: Компонент ModeSelector

**Новый файл:** `frontend/components/generation/ModeSelector.tsx`

Попап для выбора режима. Появляется при нажатии `+` в PromptBar, если модель имеет modes.

**Логика:**
- Показывает карточки режимов (label + description + icon)
- При клике на карточку → `selectMode(key)` → открывает `ElementSelectionModal`
- Если режимов == 1, попап не показывается — сразу открывается модалка

**Дизайн:**
- Используй существующие компоненты shadcn: `Dialog`, `Card`
- Иконки из lucide-react (поле `icon` в mode)
- Текст на русском (label и description приходят из backend)
- Компактный попап, не полноэкранный

---

## Шаг 4: Обновить PromptBar

**Файл:** `frontend/components/generation/PromptBar.tsx`

Изменить логику кнопки `+` (добавление изображений):
1. Получить `image_inputs_schema` из `selectedModel`
2. Если null/empty — кнопка `+` не показывается (как сейчас)
3. Если плоский список — как сейчас (прямое открытие модалки)
4. Если modes:
   - Если modes.length > 1 → открыть `ModeSelector`
   - Если modes.length === 1 → `selectMode(modes[0].key)`, открыть модалку сразу

**Не менять:** Текстовое поле промпта, кнопку генерации, отображение выбранных thumbnail.

---

## Шаг 5: Обновить ElementSelectionModal

**Файл:** `frontend/components/element/ElementSelectionModal.tsx`

Текущая логика: принимает image input slots, показывает grid для выбора.

Изменения:
1. Заголовок модалки — если есть `selectedMode`, показать `selectedMode.label` + описание слота
2. Лимит выбора — из `slot.max` текущего режима
3. Остальная логика без изменений

---

## Шаг 6: Статические ассеты

**Задача #8:** Иконки моделей и иллюстрации режимов — в `frontend/public/`, не на S3.

1. Создать директорию `frontend/public/images/models/` для иконок моделей
2. Создать директорию `frontend/public/images/modes/` для иллюстраций режимов
3. В `ModelCard.tsx` — если `preview_url` начинается с `/images/` — использовать как local path. Если http(s) — как внешний URL.

**Не делать:** Не мигрировать существующие preview_url с S3 — просто поддержать оба варианта.

---

## Чего НЕ делать в этом блоке

- Не менять бэкенд
- Не менять ConfigPanel (выбор модели)
- Не менять ParametersForm (параметры)
- Не менять ElementGrid, ElementCard, Lightbox
- Не менять API клиент (только типы)

## Проверка готовности

1. Модель без image_inputs — кнопка `+` не видна. Поведение не изменилось.
2. Модель со старым форматом (список слотов) — кнопка `+` работает как раньше.
3. Модель с modes (>1) — при нажатии `+` появляется попап выбора режима → выбираешь → открывается модалка с правильным лимитом.
4. Модель с modes (==1) — кнопка `+` сразу открывает модалку.
5. `extra_params` из выбранного режима попадают в `generation_config` при генерации.
6. Статические иконки из `frontend/public/` отображаются корректно.
