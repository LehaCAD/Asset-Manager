# AI Providers - Универсальная система генерации

## 📋 Описание

Приложение `ai_providers` реализует универсальную систему работы с AI провайдерами (Kie.ai, Replicate, Stability AI и т.д.). Система позволяет:
- Хранить настройки разных провайдеров
- Описывать структуру API запросов через JSON-схемы
- Автоматически формировать запросы к любым AI API
- Гибко настраивать параметры через UI

## 🏗️ Архитектура

### Модели

1. **AIProvider** — провайдер AI услуг
   - `name` — название (Kie.ai, Replicate, etc.)
   - `base_url` — базовый URL API
   - `api_key` — API ключ для авторизации
   - `is_active` — включен ли провайдер

2. **AIModel** — конкретная модель провайдера
   - `provider` — FK на AIProvider
   - `name` — название модели
   - `model_type` — тип: IMAGE или VIDEO
   - `api_endpoint` — endpoint для запросов (например `/api/v1/jobs/createTask`)
   - `request_schema` — JSON-схема запроса с плейсхолдерами `{{variable}}`
   - `parameters_schema` — JSON-схема для UI (какие параметры показывать пользователю)
   - `is_active` — включена ли модель

### Принцип работы

```
User Input → AIModel.request_schema + context → substitute_variables() → HTTP Request → AI Provider
```

## 🔧 Как правильно настроить модель

### Шаг 1: Создайте AIProvider

```python
from apps.ai_providers.models import AIProvider

provider = AIProvider.objects.create(
    name="Kie.ai",
    base_url="https://api.kie.ai",
    api_key="ВАШ_API_КЛЮЧ",
    is_active=True
)
```

### Шаг 2: Изучите API документацию провайдера

**Пример для Kie.ai:**

Типичный запрос:
```bash
curl -X POST "https://api.kie.ai/api/v1/jobs/createTask" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "bytedance/seedance-1.5-pro",
    "input": {
      "prompt": "Текст промпта",
      "input_urls": ["https://example.com/image.jpg"],
      "aspect_ratio": "16:9",
      "resolution": "720p",
      "duration": "8"
    }
}'
```

### Шаг 3: Создайте request_schema

**ВАЖНО:** `request_schema` — это точная копия тела запроса, где динамические значения заменены на плейсхолдеры `{{variable}}`.

#### Правила создания request_schema:

1. **Структура должна точно соответствовать API**
   - Если API ждёт массив `["url"]` — пишите массив `["{{image_url}}"]`
   - Если API ждёт объект `{"key": "value"}` — пишите объект `{"key": "{{value}}"}`
   - Если API ждёт число — можно использовать `"{{number}}"` (будет подставлено как строка)

2. **Плейсхолдеры пишутся как `{{variable_name}}`**
   - `{{prompt}}` — текст промпта от пользователя
   - `{{image_url}}` — URL изображения с S3
   - `{{resolution}}` — из generation_config
   - `{{duration}}` — из generation_config
   - `{{aspect_ratio}}` — из generation_config

3. **Массивы обрабатываются правильно**
   ```python
   # ✅ Правильно - плейсхолдер внутри массива
   "input_urls": ["{{image_url}}"]
   
   # ❌ Неправильно - плейсхолдер вместо массива
   "input_urls": "{{image_url}}"
   ```

4. **Вложенные структуры поддерживаются**
   ```python
   {
     "model": "{{model_name}}",
     "input": {
       "prompt": "{{prompt}}",
       "settings": {
         "quality": "{{quality}}"
       }
     }
   }
   ```

### Шаг 4: Примеры для разных типов моделей

#### Пример 1: Генерация изображения (Kie.ai Nano Banana)

```python
from apps.ai_providers.models import AIModel

AIModel.objects.create(
    provider=provider,
    name="Nano Banana",
    model_type="IMAGE",
    api_endpoint="/api/v1/jobs/createTask",
    request_schema={
        "model": "kie/nano-banana",
        "input": {
            "prompt": "{{prompt}}",
            "aspect_ratio": "{{aspect_ratio}}",
            "output_format": "{{output_format}}"
        }
    },
    parameters_schema={
        "aspect_ratio": {
            "type": "select",
            "label": "Соотношение сторон",
            "default": "1:1",
            "options": ["1:1", "16:9", "9:16", "4:3", "3:4"]
        },
        "output_format": {
            "type": "select",
            "label": "Формат вывода",
            "default": "png",
            "options": ["png", "jpg", "webp"]
        }
    },
    is_active=True
)
```

#### Пример 2: Видео из изображения (Kie.ai Seedance 1.5 Pro)

```python
AIModel.objects.create(
    provider=provider,
    name="Seedance 1.5 Pro",
    model_type="VIDEO",
    api_endpoint="/api/v1/jobs/createTask",
    request_schema={
        "model": "bytedance/seedance-1.5-pro",
        "input": {
            "prompt": "{{prompt}}",
            "input_urls": ["{{image_url}}"],  # Массив с одним URL
            "aspect_ratio": "{{aspect_ratio}}",
            "resolution": "{{resolution}}",
            "duration": "{{duration}}"
        }
    },
    parameters_schema={
        "aspect_ratio": {
            "type": "select",
            "label": "Соотношение сторон",
            "default": "16:9",
            "options": ["16:9", "9:16", "1:1"]
        },
        "resolution": {
            "type": "select",
            "label": "Разрешение",
            "default": "720p",
            "options": ["480p", "720p", "1080p"]
        },
        "duration": {
            "type": "select",
            "label": "Длительность (сек)",
            "default": "8",
            "options": ["4", "8", "12", "16"]
        }
    },
    is_active=True
)
```

#### Пример 3: Модель с необязательными параметрами

```python
AIModel.objects.create(
    provider=provider,
    name="Advanced Model",
    model_type="IMAGE",
    api_endpoint="/api/generate",
    request_schema={
        "model": "advanced-model-v2",
        "prompt": "{{prompt}}",
        "negative_prompt": "{{negative_prompt}}",
        "seed": "{{seed}}",
        "guidance_scale": "{{guidance_scale}}",
        "num_inference_steps": "{{num_inference_steps}}"
    },
    parameters_schema={
        "negative_prompt": {
            "type": "text",
            "label": "Негативный промпт",
            "default": "",
            "required": False
        },
        "seed": {
            "type": "number",
            "label": "Seed",
            "default": -1,
            "min": -1,
            "max": 2147483647,
            "help": "-1 для случайного"
        },
        "guidance_scale": {
            "type": "slider",
            "label": "Guidance Scale",
            "default": 7.5,
            "min": 1,
            "max": 20,
            "step": 0.5
        },
        "num_inference_steps": {
            "type": "number",
            "label": "Шаги генерации",
            "default": 50,
            "min": 10,
            "max": 150
        }
    },
    is_active=True
)
```

### Шаг 5: Как работает substitute_variables()

Функция `substitute_variables()` из `apps/assets/services.py` рекурсивно обходит `request_schema` и заменяет плейсхолдеры.

**Важная особенность:** Если весь элемент массива/значение — это один плейсхолдер `{{variable}}`, то подставляется значение **как есть** (любой тип). Если плейсхолдер внутри строки, то значение преобразуется в строку.

```python
# Пример 1: Плейсхолдер = вся строка → тип сохраняется
schema = {"count": "{{count}}"}
context = {"count": 42}
result = {"count": 42}  # int сохранён

# Пример 2: Плейсхолдер внутри строки → приводится к str
schema = {"text": "Count: {{count}}"}
context = {"count": 42}
result = {"text": "Count: 42"}  # строка

# Пример 3: Массив с плейсхолдером
schema = {"urls": ["{{image_url}}"]}
context = {"image_url": "https://s3.com/img.jpg"}
result = {"urls": ["https://s3.com/img.jpg"]}  # массив со строкой
```

## 📤 Как отправляется запрос (start_generation task)

1. **Формирование context:**
```python
context = {
    'prompt': asset.prompt_text,  # Из Asset
    'image_url': asset.parent_asset.file_url,  # Если есть parent
    # Все ключи из asset.generation_config добавляются в context
    'aspect_ratio': '16:9',
    'resolution': '720p',
    'duration': '8',
}
```

2. **Подстановка через substitute_variables:**
```python
from apps.assets.services import substitute_variables

request_body = substitute_variables(
    ai_model.request_schema,
    context
)
```

3. **HTTP запрос:**
```python
url = f"{provider.base_url}{ai_model.api_endpoint}"
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {provider.api_key}"
}
response = requests.post(url, json=request_body, headers=headers)
```

## 🧪 Тестирование

### Management команды

1. **Настроить Kie.ai автоматически:**
```bash
docker compose exec backend python manage.py setup_kie_ai --api-key YOUR_KEY
```

2. **Посмотреть все модели:**
```bash
docker compose exec backend python manage.py list_ai_models
```

3. **Тестовая генерация изображения:**
```bash
docker compose exec backend python manage.py test_generation
```

4. **Тестовая генерация видео:**
```bash
docker compose exec backend python manage.py test_video_generation
```

### Через Django Shell

```python
docker compose exec backend python manage.py shell

from apps.ai_providers.models import AIProvider, AIModel
from apps.assets.models import Asset
from apps.assets.tasks import start_generation

# Проверить схему модели
model = AIModel.objects.get(name="Seedance 1.5 Pro")
print(model.request_schema)

# Посмотреть Asset со статусом
asset = Asset.objects.get(id=6)
print(f"Status: {asset.status}")
print(f"Task ID: {asset.external_task_id}")
print(f"Error: {asset.error_message}")

# Запустить генерацию вручную
start_generation.delay(asset.id)
```

## 🔍 Отладка

### Логи Celery
```bash
docker compose logs -f celery
```

Ключевые моменты в логах:
- `🚀 Отправка запроса на генерацию` — показывает URL и Body
- `✅ Ответ от провайдера` — ответ от API
- `❌ Ошибка` — детали ошибки

### Частые ошибки

1. **422 "Model name not supported"**
   - Проверьте правильность `"model"` в `request_schema`
   - Должно совпадать с документацией провайдера

2. **500 "File type not supported"**
   - `input_urls` должен быть массивом строк `["url"]`, а не строкой
   - Проверьте, что `image_url` в S3 доступен публично

3. **401 Unauthorized**
   - Проверьте API ключ в `AIProvider.api_key`
   - Проверьте формат заголовка `Authorization`

4. **NoneType errors**
   - Убедитесь, что все обязательные поля заполнены в context
   - Добавьте значения по умолчанию в `parameters_schema`

## 📚 Примеры использования

### API запрос на генерацию видео

```bash
POST /api/boxes/1/generate/
Content-Type: application/json
Authorization: Token YOUR_TOKEN

{
  "prompt": "Beautiful sunset over mountains, cinematic",
  "ai_model_id": 2,
  "parent_asset_id": 5,
  "generation_config": {
    "aspect_ratio": "16:9",
    "resolution": "1080p",
    "duration": "12"
  }
}
```

### Ответ

```json
{
  "id": 7,
  "status": "PENDING",
  "status_display": "В ожидании",
  "source_type": "IMG2VID",
  "prompt_text": "Beautiful sunset over mountains, cinematic",
  "ai_model": 2,
  "ai_model_name": "Seedance 1.5 Pro",
  "parent_asset": 5,
  "generation_config": {
    "aspect_ratio": "16:9",
    "resolution": "1080p",
    "duration": "12"
  }
}
```

## 🎯 Быстрый старт для новой модели

1. Определите тип модели (IMAGE/VIDEO)
2. Найдите документацию API провайдера
3. Скопируйте пример curl запроса
4. Замените динамические значения на `{{variable}}`
5. Создайте AIModel с этим request_schema
6. Добавьте parameters_schema для UI
7. Протестируйте через management команду

## 🔗 Связанные файлы

- **Модели:** `backend/apps/ai_providers/models.py`
- **Задачи:** `backend/apps/assets/tasks.py`
- **Подстановка:** `backend/apps/assets/services.py` → `substitute_variables()`
- **Management команды:** `backend/apps/ai_providers/management/commands/`
- **API endpoint:** `backend/apps/boxes/views.py` → `BoxViewSet.generate()`

---

**Документация обновлена:** 2026-02-08
