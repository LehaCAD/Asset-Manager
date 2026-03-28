# Block 1 Backend → Block 2 Frontend: Handoff Document

> Всё что нужно знать фронтенд-агенту про бэкенд-контракты image_inputs_schema,
> response_mapping, параметры, pricing и generation flow.

---

## 1. image_inputs_schema — два формата

AIModel возвращает `image_inputs_schema` в одном из двух форматов.

### Формат A: Простой список (Nano-Banana и подобные)

```json
[
  {
    "key": "input_urls",
    "label": "Выберите до 14 изображений",
    "min": 0,
    "max": 14
  }
]
```

**Правила фронтенда:**
- `Array.isArray(schema)` → простой формат
- Если один слот → [+] сразу открывает модалку выбора ассетов
- Если несколько слотов → [+] открывает dropdown с выбором слота
- `label` — надпись в модалке (НЕ добавлять "Выбор:" перед ним)
- `key` — ключ в `generation_config.imageInputsMap`, совпадает с `{{placeholder}}` в request_schema

### Формат B: Группы с режимами (Seedance, VEO)

```json
{
  "mode": "groups",
  "no_images_params": {
    "generation_type": "TEXT_2_VIDEO",
    "image_urls": []
  },
  "groups": [
    {
      "key": "frames",
      "label": "Кадры",
      "collect_to": "image_urls",
      "exclusive_with": ["references"],
      "extra_params": {
        "generation_type": "FIRST_AND_LAST_FRAMES_2_VIDEO"
      },
      "slots": [
        {
          "key": "start_frame",
          "label": "Начальный кадр",
          "description": "Выберите изображение для начала видео",
          "icon": "play-circle",
          "min": 1,
          "max": 1
        },
        {
          "key": "end_frame",
          "label": "Конечный кадр",
          "description": "Выберите изображение для конца видео",
          "icon": "skip-forward",
          "min": 0,
          "max": 1,
          "depends_on": "start_frame"
        }
      ]
    },
    {
      "key": "references",
      "label": "Референсы",
      "collect_to": "image_urls",
      "exclusive_with": ["frames"],
      "extra_params": {
        "generation_type": "REFERENCE_2_VIDEO"
      },
      "slots": [
        {
          "key": "ref_images",
          "label": "Референсные изображения",
          "description": "До 3 изображений",
          "icon": "images",
          "min": 1,
          "max": 3
        }
      ]
    }
  ]
}
```

**Определение формата:**
```typescript
function isGroupsFormat(schema: ImageInputsSchema): schema is ImageInputGroupsSchema {
  return !Array.isArray(schema) && schema?.mode === 'groups';
}
```

---

## 2. Поля схемы — что каждое значит

### Поля группы

| Поле | Тип | Обязательно | Назначение |
|------|-----|-------------|------------|
| `key` | string | да | Уникальный ID группы |
| `label` | string | нет | Название режима в попапе (если групп > 1) |
| `collect_to` | string | нет | Ключ в generation_config куда собрать ВСЕ URL из слотов этой группы. Если не указан — каждый слот отправляется под своим key |
| `exclusive_with` | string[] | нет | Группы, которые нельзя использовать одновременно |
| `extra_params` | object | нет | Доп. параметры для API при использовании этой группы |
| `slots` | Slot[] | да | Слоты для загрузки изображений |

### Поля слота

| Поле | Тип | Обязательно | Назначение |
|------|-----|-------------|------------|
| `key` | string | да | Уникальный ID слота внутри группы |
| `label` | string | да | Надпись для пользователя |
| `description` | string | нет | Подпись мелким текстом |
| `icon` | string | нет | Имя иконки (lucide-react) |
| `min` | number | да | Минимум картинок (0 = необязательно) |
| `max` | number | да | Максимум картинок |
| `depends_on` | string | нет | Key другого слота в той же группе. Этот слот доступен ТОЛЬКО когда depends_on-слот заполнен |

### Верхнеуровневые поля (groups формат)

| Поле | Тип | Назначение |
|------|-----|------------|
| `mode` | `"groups"` | Маркер формата |
| `no_images_params` | object | Параметры для подстановки когда пользователь НЕ загрузил ни одной картинки |
| `groups` | Group[] | Массив групп |

---

## 3. Логика фронтенда — полная схема

```
Пользователь нажимает [+]
│
├── Простой формат (Array.isArray)
│   ├── 1 слот → сразу открыть модалку
│   └── 2+ слотов → dropdown выбора слота → модалка
│
└── Groups формат (schema.mode === "groups")
    ├── 1 группа, нет exclusive_with
    │   └── Показать слоты напрямую (как dropdown или список)
    │
    └── 2+ групп ИЛИ есть exclusive_with
        └── Показать попап выбора режима
            ├── Каждая группа = карточка с label + icon первого слота
            ├── Выбрал группу → показать слоты этой группы
            └── Группы из exclusive_with — заблокированы
```

### depends_on логика

```
Слот B depends_on слот A:
├── A пустой → B заблокирован (disabled, серый, tooltip "Сначала загрузите {A.label}")
└── A заполнен → B разблокирован
```

### exclusive_with логика

```
Группа "frames" exclusive_with ["references"]:
├── Пользователь загрузил картинку в "frames"
│   └── Группа "references" заблокирована целиком
├── Пользователь удалил все картинки из "frames"
│   └── "references" снова доступна
└── Ничего не загружено → обе группы доступны
```

---

## 4. Как формируется generation_config

При нажатии "Генерировать":

```typescript
// 1. Базовые параметры из ConfigPanel
const config = {
  prompt: "...",
  resolution: "1K",
  aspect_ratio: "16:9",
  // ... остальные из parameters_schema
};

// 2. Картинки
const imageInputsMap: Record<string, string[]> = {};

if (isGroupsFormat) {
  const group = selectedGroup; // выбранная группа

  if (group.collect_to) {
    // ВСЕ картинки из всех слотов → в один ключ, в порядке слотов
    const allUrls: string[] = [];
    for (const slot of group.slots) {
      allUrls.push(...getFilesForSlot(slot.key).map(f => f.apiUrl));
    }
    imageInputsMap[group.collect_to] = allUrls;
  } else {
    // Каждый слот → свой ключ
    for (const slot of group.slots) {
      imageInputsMap[slot.key] = getFilesForSlot(slot.key).map(f => f.apiUrl);
    }
  }

  // 3. extra_params из активной группы
  if (hasAnyImages && group.extra_params) {
    Object.assign(config, group.extra_params);
  }

  // 4. no_images_params если картинок нет
  if (!hasAnyImages && schema.no_images_params) {
    Object.assign(config, schema.no_images_params);
  }

} else {
  // Простой формат — каждый слот → свой ключ
  for (const input of imageInputs) {
    imageInputsMap[input.key] = input.files.map(f => f.apiUrl);
  }
}

// Финальный payload
const payload = {
  ...config,
  ...imageInputsMap,
};
// POST /api/scenes/{id}/generate/ с телом { generation_config: payload }
```

---

## 5. Что делает бэкенд с generation_config

```
Frontend отправляет:
{
  "generation_config": {
    "prompt": "котик",
    "resolution": "1K",
    "aspect_ratio": "16:9",
    "generation_type": "FIRST_AND_LAST_FRAMES_2_VIDEO",  ← из extra_params
    "image_urls": ["https://s3.../img1.jpg"]              ← из collect_to
  }
}

Backend берёт request_schema модели:
{
  "prompt": "{{prompt}}",
  "imageUrls": "{{image_urls}}",
  "generationType": "{{generation_type}}",
  "aspect_ratio": "{{aspect_ratio}}",
  "model": "veo3_fast",
  "callBackUrl": "{{callback_url}}"
}

И подставляет значения:
{
  "prompt": "котик",
  "imageUrls": ["https://s3.../img1.jpg"],
  "generationType": "FIRST_AND_LAST_FRAMES_2_VIDEO",
  "aspect_ratio": "16:9",
  "model": "veo3_fast",
  "callBackUrl": "https://raskadrawka.ru/api/ai/callback/"
}
```

**Важно:** ключи в `generation_config` должны совпадать с `{{placeholder}}` в request_schema (без фигурных скобок). `collect_to: "image_urls"` → в config уйдёт `image_urls` → подставится в `{{image_urls}}`.

---

## 6. parameters_schema — формат

Бэкенд компилирует и отдаёт:

```json
[
  {
    "request_key": "aspect_ratio",
    "label": "Соотношение сторон",
    "ui_semantic": "aspect_ratio",
    "options": [
      {"value": "16:9", "label": "16:9"},
      {"value": "9:16", "label": "9:16"}
    ],
    "default": "16:9"
  },
  {
    "request_key": "generate_audio",
    "label": "Аудио",
    "ui_semantic": "switch",
    "default": false
  }
]
```

**Правила:**
- `value` — что уходит в API, `label` — что видит пользователь
- `ui_semantic` определяет тип контрола: `"switch"` → toggle, `"resolution"` → кнопки, `"aspect_ratio"` → кнопки с иконками
- `default` — значение при первом выборе модели. **Фронтенд ОБЯЗАН** отправлять дефолты для всех параметров, даже если пользователь их не трогал
- Скрытые параметры (`role: "hidden"`) не попадают в parameters_schema — они подставляются через extra_params / no_images_params

---

## 7. Оценка стоимости (estimate)

```
POST /api/credits/estimate/
{
  "model_id": 5,
  "generation_config": { ... те же параметры что при генерации ... }
}

Ответ: { "estimated_cost": "14.00" }
```

**Когда вызывать:** при каждом изменении параметра, от которого зависит цена. Фронтенд показывает цену на кнопке генерации.

**Важно:** отправлять `generation_config` с текущими values (не labels!). Если value = `"jpeg"`, отправлять `"jpeg"`, не `"JPEG"`.

---

## 8. TypeScript типы (уже определены)

```typescript
// frontend/lib/types/index.ts

export interface ImageInputSchemaItem {
  key: string;
  label: string;
  min: number;
  max: number;
  required?: boolean;
  description?: string;
  depends_on?: string;
}

export interface ImageInputGroup {
  key: string;
  label: string;
  collect_to?: string;
  exclusive_with?: string[];
  extra_params?: Record<string, unknown>;
  slots: ImageInputSchemaItem[];
}

export interface ImageInputGroupsSchema {
  mode: "groups";
  groups: ImageInputGroup[];
  no_images_params?: Record<string, unknown>;
}

export type ImageInputsSchema = ImageInputSchemaItem[] | ImageInputGroupsSchema;
```

---

## 9. Реальные конфигурации моделей (для тестирования)

### Nano-Banana-2 (простой формат, изображения)
```
image_inputs_schema: [{"key": "input_urls", "max": 14, "min": 0, "label": "Выберите до 14 изображений"}]
parameters: resolution (1K/2K/4K), aspect_ratio, google_search (switch), output_format (jpg/png)
pricing: lookup по resolution
```

### Seedance 1.5 Pro (groups, одна группа, видео)
```
image_inputs_schema: {
  "mode": "groups",
  "no_images_params": {},
  "groups": [{
    "key": "frames",
    "collect_to": "input_urls",
    "slots": [
      {"key": "start_frame", "label": "Начальный кадр", "min": 1, "max": 1},
      {"key": "end_frame", "label": "Конечный кадр", "min": 0, "max": 1, "depends_on": "start_frame"}
    ]
  }]
}
parameters: duration (4/8/12), resolution (480p/720p/1080p), aspect_ratio, generate_audio (switch)
pricing: lookup по duration × resolution × generate_audio
```

### VEO 3.1 Fast (groups, две группы, видео)
```
image_inputs_schema: {
  "mode": "groups",
  "no_images_params": {"generation_type": "TEXT_2_VIDEO", "image_urls": []},
  "groups": [
    {
      "key": "frames",
      "label": "Кадры",
      "collect_to": "image_urls",
      "exclusive_with": ["references"],
      "extra_params": {"generation_type": "FIRST_AND_LAST_FRAMES_2_VIDEO"},
      "slots": [
        {"key": "start_frame", "label": "Начальный кадр", "min": 1, "max": 1},
        {"key": "end_frame", "label": "Конечный кадр", "min": 0, "max": 1, "depends_on": "start_frame"}
      ]
    },
    {
      "key": "references",
      "label": "Референсы",
      "collect_to": "image_urls",
      "exclusive_with": ["frames"],
      "extra_params": {"generation_type": "REFERENCE_2_VIDEO"},
      "slots": [
        {"key": "ref_images", "label": "Референсные изображения", "min": 1, "max": 3}
      ]
    }
  ]
}
parameters: aspect_ratio (16:9 / 9:16 / auto)
pricing: фиксированная
```

---

## 10. Чеклист для фронтенд-агента

- [ ] `selectModel()` корректно обрабатывает оба формата (Array и groups)
- [ ] [+] кнопка: простой формат с 1 слотом → сразу модалка, без dropdown/popup
- [ ] [+] кнопка: groups с 1 группой → показать слоты напрямую
- [ ] [+] кнопка: groups с 2+ группами → попап выбора режима
- [ ] `depends_on`: слот заблокирован пока parent не заполнен
- [ ] `exclusive_with`: активация одной группы блокирует другие
- [ ] `collect_to`: все URL из слотов группы → один ключ в generation_config
- [ ] `extra_params`: подставляются в generation_config при активной группе
- [ ] `no_images_params`: подставляются когда картинок нет
- [ ] `label` в модалке — без префикса "Выбор:"
- [ ] Все параметры отправляют `value` (не `label`) в generation_config
- [ ] Дефолты из `parameters_schema.default` подставляются при selectModel
- [ ] `estimate` вызывается при каждом изменении параметра
- [ ] Boolean параметры (switch) отправляют `true`/`false`, не строки
