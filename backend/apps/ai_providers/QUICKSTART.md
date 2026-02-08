# 🚀 Быстрая инструкция: Добавление новой AI модели

## Шаг 1: Изучите API документацию

Найдите пример curl запроса для вашей модели:

```bash
curl -X POST "https://api.provider.com/generate" \
  -H "Authorization: Bearer KEY" \
  -d '{
    "model": "model-name",
    "input": {
      "prompt": "текст",
      "image": "https://url.com/img.jpg"
    }
  }'
```

## Шаг 2: Создайте request_schema

Замените **все динамические значения** на `{{variable}}`:

```python
request_schema = {
    "model": "model-name",  # Статическое значение - оставляем как есть
    "input": {
        "prompt": "{{prompt}}",  # Динамическое - заменяем на плейсхолдер
        "image": "{{image_url}}"  # Динамическое - заменяем на плейсхолдер
    }
}
```

### ⚠️ ВАЖНО: Типы данных

```python
# ✅ ПРАВИЛЬНО - массив с плейсхолдером внутри
"images": ["{{image_url}}"]

# ❌ НЕПРАВИЛЬНО - плейсхолдер вместо массива
"images": "{{image_url}}"

# ✅ ПРАВИЛЬНО - вложенный объект
"settings": {
    "quality": "{{quality}}",
    "format": "{{format}}"
}
```

## Шаг 3: Создайте модель через Django Shell

```python
docker compose exec backend python manage.py shell
```

```python
from apps.ai_providers.models import AIProvider, AIModel

# Найдите или создайте провайдера
provider = AIProvider.objects.get(name="Provider Name")

# Создайте модель
AIModel.objects.create(
    provider=provider,
    name="Model Display Name",
    model_type="VIDEO",  # или "IMAGE"
    api_endpoint="/api/endpoint",  # Часть URL после base_url
    request_schema={
        # Ваша схема из шага 2
    },
    parameters_schema={
        # UI параметры (необязательно, но рекомендуется)
        "aspect_ratio": {
            "type": "select",
            "label": "Соотношение сторон",
            "default": "16:9",
            "options": ["16:9", "9:16", "1:1"]
        }
    },
    is_active=True
)
```

## Шаг 4: Протестируйте

```bash
# Через management команду
docker compose exec backend python manage.py test_generation

# Или через API
curl -X POST http://localhost:8000/api/boxes/1/generate/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -d '{
    "prompt": "test prompt",
    "ai_model_id": 2,
    "generation_config": {
      "aspect_ratio": "16:9"
    }
  }'
```

## Шаг 5: Проверьте логи

```bash
docker compose logs -f celery
```

Ищите:
- `🚀 Отправка запроса` - проверьте, что Body правильный
- `✅ Ответ от провайдера` - успешный ответ
- `❌ Ошибка` - детали ошибки

## 📋 Доступные переменные в context

Эти переменные автоматически доступны в `{{...}}`:

| Переменная | Источник | Пример значения |
|------------|----------|-----------------|
| `{{prompt}}` | `asset.prompt_text` | "Beautiful sunset" |
| `{{image_url}}` | `asset.parent_asset.file_url` | "https://s3.com/img.jpg" |
| `{{aspect_ratio}}` | `generation_config` | "16:9" |
| `{{resolution}}` | `generation_config` | "720p" |
| `{{duration}}` | `generation_config` | "8" |
| *любые другие* | `generation_config` | *пользовательские* |

## 🎯 Примеры для популярных провайдеров

### Kie.ai (Image)
```python
{
    "model": "kie/nano-banana",
    "input": {
        "prompt": "{{prompt}}",
        "aspect_ratio": "{{aspect_ratio}}"
    }
}
```

### Kie.ai (Video)
```python
{
    "model": "bytedance/seedance-1.5-pro",
    "input": {
        "prompt": "{{prompt}}",
        "input_urls": ["{{image_url}}"],
        "aspect_ratio": "{{aspect_ratio}}",
        "resolution": "{{resolution}}",
        "duration": "{{duration}}"
    }
}
```

### Replicate (Flux)
```python
{
    "input": {
        "prompt": "{{prompt}}",
        "width": "{{width}}",
        "height": "{{height}}",
        "num_outputs": "{{num_outputs}}"
    }
}
```

### Stability AI
```python
{
    "text_prompts": [
        {
            "text": "{{prompt}}",
            "weight": 1
        }
    ],
    "cfg_scale": "{{cfg_scale}}",
    "height": "{{height}}",
    "width": "{{width}}",
    "samples": "{{samples}}",
    "steps": "{{steps}}"
}
```

## 🔧 Отладка

### Проблема: 422 "Model not supported"
- Проверьте поле `"model"` в `request_schema`
- Оно должно точно совпадать с документацией провайдера

### Проблема: 500 "File type not supported"
- Убедитесь, что массивы указаны правильно: `["{{url}}"]`, не `"{{url}}"`
- Проверьте, что файл на S3 доступен публично

### Проблема: Неправильные значения подставляются
- Проверьте spelling переменных: `{{image_url}}` != `{{imageUrl}}`
- Убедитесь, что значения передаются в `generation_config`

---

**Полная документация:** `backend/apps/ai_providers/README.md`
