# Блок 1: Админка AI-моделей — бэкенд

> Задачи из agent-tasks.md: #1 (Конфигурация AI-моделей), #2 (Редактор прайса)
> Зависимости: Блок 0 (baseline закоммичен)
> Область: только `backend/apps/ai_providers/`, шаблоны и статика админки. Фронтенд НЕ трогать.

## Цель

Сделать админку AI-моделей самодостаточной: через неё можно настроить любую модель — включая режимы медиа-выбора (VEO-стиль) и pricing — без правки кода.

---

## Часть A: Режимы медиа-выбора (image input modes)

### Контекст

Сейчас `image_inputs_schema` на AIModel — плоский список слотов: `[{"key": "style_ref", "label": "Style Ref", "min": 0, "max": 4}]`. Для каждого слота PromptBar показывает кнопку.

Новая задача: некоторые модели (VEO) имеют **несколько режимов работы**, каждый с разными image inputs и параметрами. Пользователь выбирает режим перед выбором изображений.

### Архитектурное решение

**НЕ создавать новую модель.** Расширить `image_inputs_schema` так:

```json
{
  "modes": [
    {
      "key": "first_frame",
      "label": "Начальный кадр",
      "description": "Выберите один кадр для начала видео",
      "icon": "play-circle",
      "slots": [
        {"key": "first_frame_image", "label": "Начальный кадр", "min": 1, "max": 1, "required": true}
      ],
      "extra_params": {
        "generationType": "FIRST_FRAME"
      }
    },
    {
      "key": "last_frame",
      "label": "Конечный кадр",
      "description": "Выберите один кадр для конца видео",
      "icon": "skip-forward",
      "slots": [
        {"key": "last_frame_image", "label": "Конечный кадр", "min": 1, "max": 1, "required": true}
      ],
      "extra_params": {
        "generationType": "LAST_FRAME"
      }
    },
    {
      "key": "references",
      "label": "Референсы",
      "description": "Выберите до 3 референсных изображений",
      "icon": "images",
      "slots": [
        {"key": "ref_images", "label": "Референсы", "min": 1, "max": 3, "required": true}
      ],
      "extra_params": {
        "generationType": "REFERENCES"
      }
    }
  ],
  "default_mode": "first_frame"
}
```

**Обратная совместимость:** Если `image_inputs_schema` — список (старый формат), фронт работает как раньше (прямой выбор без попапа режима). Если объект с `"modes"` — показывает попап.

### Шаг A.1: Обновить help_text и валидацию

**Файл:** `backend/apps/ai_providers/models.py`

1. Обновить `help_text` поля `image_inputs_schema`:
   ```
   Либо список слотов: [{"key": ..., "label": ..., "min": 0, "max": 4}]
   Либо объект с режимами: {"modes": [...], "default_mode": "key"}
   ```
2. Не менять тип поля (JSONField), не менять default.

### Шаг A.2: Добавить валидатор формата

**Файл:** `backend/apps/ai_providers/validators.py`

Добавить функцию `validate_image_inputs_schema(value)`:
- Если `list` — валидировать старый формат (каждый элемент имеет key, label).
- Если `dict` с ключом `"modes"` — валидировать новый формат:
  - `modes` — непустой список, каждый mode имеет key, label, slots.
  - `slots` — список с key, label, max.
  - `default_mode` — опционален, если есть — должен быть в modes.
  - `extra_params` — опциональный dict.
- Иначе — ошибка.

### Шаг A.3: Админка — редактор image_inputs_schema

**Файлы:**
- `backend/apps/ai_providers/admin_forms.py`
- `backend/templates/admin/ai_providers/aimodel/change_form.html`
- `backend/static/admin/ai_providers/aimodel_workflow.js`

Добавить в админку AIModel вкладку/секцию для image inputs:
1. **Таблица режимов** (если формат с modes):
   - Строки: key, label, description, icon
   - Вложенная таблица слотов для каждого режима: key, label, min, max, required
   - Поле extra_params как JSON-текстовое поле
   - Кнопки: добавить режим, удалить режим, добавить слот
2. **Простая таблица слотов** (если старый формат):
   - Строки: key, label, min, max, required
   - Кнопка: конвертировать в формат с режимами

Под таблицей — переключатель "Таблица / JSON" (как будет для прайса).

### Шаг A.4: Сериализатор — отдать image_inputs_schema как есть

**Файл:** `backend/apps/ai_providers/serializers.py`

Проверить что `AIModelSerializer` отдаёт `image_inputs_schema` без изменений. Фронт сам определит формат. Ничего менять не нужно, если поле уже в сериализаторе.

---

## Часть B: Редактор прайса — JSON и таблица

### Контекст

Сейчас pricing настраивается через `ModelPricingConfig` в админке. Пользователь хочет:
1. Вставить JSON напрямую (скопировать из внешнего источника).
2. Переключиться в визуальную таблицу для правки деталей.
3. Обратная синхронизация: правки в таблице обновляют JSON и наоборот.

### Шаг B.1: JSON/таблица переключатель для pricing

**Файлы:**
- `backend/static/admin/ai_providers/aimodel_workflow.js`
- `backend/static/admin/ai_providers/aimodel_workflow.css`
- `backend/templates/admin/ai_providers/aimodel/change_form.html`

Реализовать:
1. **Переключатель режима:** два таба — "Таблица" и "JSON"
2. **Режим JSON:**
   - `<textarea>` с подсветкой (или хотя бы monospace)
   - Кнопка "Применить JSON" — парсит, валидирует, обновляет таблицу
   - Показывать ошибки валидации inline
3. **Режим Таблица:**
   - Для FIXED: одно поле "Стоимость"
   - Для LOOKUP: таблица — строки по комбинациям cost_params, столбец "Стоимость"
   - Кнопки добавления/удаления строк
   - При сохранении → генерирует JSON
4. **Синхронизация:**
   - Переключение таба пересобирает данные из текущего режима
   - Инструкция над каждым режимом: что это, как пользоваться

### Шаг B.2: Инструкции в интерфейсе

Над каждой секцией — текстовый блок с пояснением:
- "Вставьте JSON ценообразования. Формат: {\"fixed_cost\": \"5.00\"} или {\"cost_params\": [...], \"costs\": {...}}"
- "Таблица автоматически формирует JSON. Измените значения и сохраните."

Язык: русский.

---

## Что НЕ делать в этом блоке

- Не менять фронтенд (PromptBar, ConfigPanel, etc.)
- Не менять модель Element, Scene, Project
- Не менять Celery tasks
- Не менять API endpoints (кроме сериализатора если нужно)
- Не менять compiler.py (если image_inputs_schema не участвует в компиляции — не трогать)

## Проверка готовности

1. В админке можно создать AIModel с `image_inputs_schema` в формате modes.
2. В админке можно переключаться JSON/Таблица для pricing.
3. Существующие модели продолжают работать (старый формат image_inputs_schema).
4. `GET /api/ai-models/{id}/` возвращает корректный image_inputs_schema.
5. Миграции применяются на production БД без потери данных.
