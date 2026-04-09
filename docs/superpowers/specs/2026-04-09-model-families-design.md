# Model Families — Design Spec

## Problem

AI-провайдеры выпускают модели семействами: Veo 3.1 Fast / Quality, Flux 2 Pro / Flex, Kling 2.1 / 2.1 Master / 2.0. Сейчас каждая модель — отдельная карточка в пикере, что засоряет UI. Нужно группировать варианты одной модели и переключать их внутри выбранной модели.

## Solution

Новая сущность `ModelFamily` для группировки. Каждый вариант — полноценная `AIModel` со своим endpoint, параметрами, ценой. Никакого наследования — только визуальная группировка.

---

## 1. Data Model

### New: `ModelFamily`

| Field | Type | Description |
|-------|------|-------------|
| `id` | BigAutoField | PK |
| `name` | CharField(100) | Display name: "Veo 3.1", "Flux 2" |
| `model_type` | CharField(10), choices=IMAGE/VIDEO | Должен совпадать с типом всех вариантов |
| `preview_url` | CharField(500), blank | Превью для карточки в пикере |
| `description` | TextField, blank | Описание семейства для пикера |
| `tags` | JSONField, default=list | Бейджи карточки в пикере |
| `variant_ui_control` | CharField(20), choices=pills/select, default=pills | Тип переключателя вариантов на фронте. Выбирается админом вручную |
| `sort_order` | PositiveIntegerField, default=0 | Порядок в пикере |
| `is_active` | BooleanField, default=True | Вкл/выкл всё семейство |
| `created_at` | DateTimeField, auto_now_add | |
| `updated_at` | DateTimeField, auto_now | |

### Changes to `AIModel`

| Field | Type | Description |
|-------|------|-------------|
| `family` | FK(ModelFamily), null=True, blank=True, related_name='variants' | Принадлежность к семейству. NULL = standalone |
| `variant_label` | CharField(100), blank=True | Короткое название варианта: "Fast", "Quality", "Pro" |
| `variant_sort_order` | PositiveIntegerField, default=0 | Порядок варианта в переключателе |
| `is_default_variant` | BooleanField, default=False | Какой вариант выбирается при клике на семейство |

### Ordering

- `ModelFamily.Meta.ordering`: `['sort_order', 'name']`
- `AIModel` variant ordering within family: `['variant_sort_order', 'id']` (tiebreaker by id)

### Validation Rules

- В семействе ровно один `is_default_variant=True` (enforce в model clean + admin form)
- `family.model_type` должен совпадать с `AIModel.model_type` всех вариантов (проверка в `AIModel.clean()` при каждом save)
- `variant_label` обязателен если `family` задано
- `variant_label` пуст если `family` не задано

---

## 2. Admin UX

### 2.1 AIModel Form — Step 0 "Семейство"

Новая секция перед существующим Step 1. Компактная, в одну строку:

- **Семейство** — FK dropdown (пусто = standalone). Кнопка "+" для создания нового (Django raw_id popup).
- **Название варианта** — текстовое поле. Видно только когда семейство выбрано.
- **Порядок** — число. Видно только когда семейство выбрано.
- **По умолчанию** — чекбокс. Видно только когда семейство выбрано.

JS скрывает/показывает поля variant_label, variant_sort_order, is_default_variant в зависимости от значения family.

### 2.2 AIModel Form — "Клонировать как вариант"

Кнопка внизу формы существующей модели. При клике:

Вся операция выполняется в `transaction.atomic()`:

1. Создаёт копию AIModel (все поля, включая request_schema, image_inputs_schema)
2. Копирует все ModelParameterBinding записи
3. Копирует ModelPricingConfig
4. Если оригинал в семействе → копия в том же семействе, variant_label пустой (заполнить вручную)
5. Если оригинал standalone → создаёт ModelFamily из данных оригинала (name, preview_url, description, tags, model_type), привязывает оригинал как default variant (variant_label берётся из name оригинала), копию как второй вариант
6. Redirect на страницу копии

### 2.3 ModelFamily Admin Page

Лёгкая форма:
- name, model_type, preview_url, description, tags, variant_ui_control, sort_order, is_active

Read-only секция "Варианты" внизу — таблица:
| Модель | Вариант | По умолч. | Активна | [Открыть] |

Changelist: name, model_type, variant count, is_active.

### 2.4 AIModel Changelist

Новые колонки: "Семейство" (pill или "— standalone"), "Вариант" (label + star для default).
Фильтр по семейству.

---

## 3. API

### Filtering

- Существующие фильтры (`is_active=True`, `provider__is_active=True`) остаются
- Новый фильтр: `ModelFamily.is_active=False` → все варианты этого семейства исключаются из ответа, независимо от их индивидуального `is_active`
- Queryset: `.exclude(family__is_active=False)`

### GET /api/ai-models/

Формат ответа — плоский список, обратно совместимый. Новые поля:

```json
{
  "id": 5,
  "name": "Veo 3.1 fast",
  "family": {
    "id": 1,
    "name": "Veo 3.1",
    "preview_url": "/images/veo.png",
    "description": "Видеогенерация от Google DeepMind",
    "tags": ["Start Frame"],
    "variant_ui_control": "pills"
  },
  "variant_label": "Fast",
  "is_default_variant": true,
  "variant_sort_order": 0,
  // ...existing fields...
}
```

Standalone модели: `"family": null`, остальные variant-поля пустые/false.

### Serializer Changes

- `AIModelSerializer`: добавить `family` (nested read-only), `variant_label`, `is_default_variant`, `variant_sort_order`
- Новый `ModelFamilyBriefSerializer`: id, name, preview_url, description, tags, variant_ui_control

---

## 4. Frontend

### 4.1 TypeScript Types

```typescript
interface ModelFamilyBrief {
  id: number;
  name: string;
  preview_url: string;
  description: string;
  tags: string[];
  variant_ui_control: 'pills' | 'select';
}

// Add to AIModel:
interface AIModel {
  // ...existing fields...
  family: ModelFamilyBrief | null;
  variant_label: string;
  is_default_variant: boolean;
  variant_sort_order: number;
}
```

### 4.2 Generation Store

Новая функция (паттерн как `canGenerate()`):

```typescript
familyVariants: (): AIModel[] => {
  const { selectedModel, availableModels } = get();
  if (!selectedModel?.family) return [];
  return availableModels
    .filter(m => m.family?.id === selectedModel.family!.id)
    .sort((a, b) => a.variant_sort_order - b.variant_sort_order);
}
```

`selectModel()` — без изменений, принимает AIModel.

`retryFromElement()` — без изменений. Варианты — полноценные AIModel, `find(m => m.id === element.ai_model)` находит нужный вариант, `selectModel()` корректно покажет switcher.

### 4.3 ModelSelector (Picker)

Группировка на клиенте:
- Модели с `family !== null` группируются по `family.id`
- Одна карточка на семейство: preview/name/description/tags из `family`
- Клик → `selectModel(defaultVariant)`
- Standalone модели (family === null) — карточка как сейчас, из самой модели
- **Для пользователя нет визуальной разницы** между карточкой семейства и standalone

**Ordering в пикере:** family-карточки сортируются по `family.sort_order`, standalone по `name`. Оба типа объединяются в один список, family-карточки идут в порядке sort_order, standalone — алфавитно после них.

**Selected state:** карточка семейства подсвечена (isSelected), если `selectedModel` принадлежит любому варианту этого семейства. Проверка: `selectedModel.family?.id === family.id`.

**Адаптация к деактивации вариантов:** если в семействе остаётся 1 активный вариант — переключатель в ConfigPanel не показывается (familyVariants.length < 2). Карточка в пикере всё ещё отображается с данными семейства.

### 4.4 ConfigPanel — Variant Switcher

Показывается только если `familyVariants.length >= 2`:

- **`variant_ui_control === 'pills'`**: pill-кнопки в ряд (как в mockup "ConfigPanel — Variant Switcher")
- **`variant_ui_control === 'select'`**: shadcn Select dropdown (как в mockup "ConfigPanel — Variant Dropdown")
- Переключение варианта = `selectModel(другойВариант)` — полная замена AIModel

Компонент `VariantSwitcher`:
- Props: `variants: AIModel[]`, `currentId: number`, `uiControl: 'pills' | 'select'`, `onSelect: (model: AIModel) => void`
- Рендерит pills или select в зависимости от `uiControl`

Если `familyVariants.length < 2` — компонент не рендерится.

### 4.5 ModelCard (in Selector)

Единственное изменение: при рендере списка моделей, модели с family группируются. Для каждой группы создаётся одна карточка с данными из family. Визуально карточка идентична standalone.

---

## 5. Migration

- `0001_modelfamily.py`: создаёт таблицу ModelFamily
- `0002_aimodel_family_fields.py`: добавляет family FK (nullable), variant_label, variant_sort_order, is_default_variant на AIModel
- Все существующие модели: `family=NULL` — ноль breaking changes
- Data migration не нужна

---

## 6. Mockups

Pen-файл: `pen/pencil-new.pen`

| Frame | Node ID | Description |
|-------|---------|-------------|
| ConfigPanel — Variant Switcher | `rMaSE` | Pills для 2-3 вариантов (Veo 3.1: Fast / Quality) |
| ConfigPanel — Variant Dropdown (4+) | `akUUu` | Select dropdown (Kling: Kling 2.1 Master) |
| Model Selector — Families | `mh2iL` | Карточки без разницы family/standalone |

---

## 7. Scope & Non-Goals

### In scope
- ModelFamily CRUD (Django admin)
- AIModel family fields + admin UI (Step 0, clone, changelist)
- API: family info in /api/ai-models/
- Frontend: group models in picker, variant switcher in ConfigPanel
- Admin выбирает тип переключателя (pills/select) для каждого семейства

### Not in scope
- Наследование параметров между вариантами (каждый вариант — полностью независимая AIModel)
- Автоматическое создание семейств
- Drag-and-drop reorder вариантов в админке
- Вложенные семейства (семейство семейств)
