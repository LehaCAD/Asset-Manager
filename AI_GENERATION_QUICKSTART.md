# 🚀 Быстрый старт - AI Generation

## Проверка что все работает

```bash
# 1. Проверить что Celery запущен
docker compose ps

# 2. Список AI моделей
docker compose exec backend python manage.py list_ai_models

# 3. Тест генерации видео
docker compose exec backend python manage.py test_video_generation

# 4. Логи Celery (в реальном времени)
docker compose logs -f celery
```

## Использование через API

### 1. Загрузить изображение

```bash
curl -X POST http://localhost:8000/api/boxes/1/upload/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -F "file=@image.jpg" \
  -F "prompt_text=Source image"
```

**Ответ:** Asset с `id`, `file_url` на S3

### 2. Запустить генерацию видео

```bash
curl -X POST http://localhost:8000/api/boxes/1/generate/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Beautiful cinematic movement",
    "ai_model_id": 2,
    "parent_asset_id": 5,
    "generation_config": {
      "aspect_ratio": "16:9",
      "resolution": "720p",
      "duration": "8"
    }
  }'
```

**Ответ:** Asset со `status: "PENDING"`

### 3. Проверить статус

```bash
curl -H "Authorization: Token YOUR_TOKEN" \
  http://localhost:8000/api/assets/6/
```

**Статусы:**
- `PENDING` - в очереди
- `PROCESSING` - генерируется (появится `external_task_id`)
- `COMPLETED` - готово (появится `file_url` на S3)
- `FAILED` - ошибка (появится `error_message`)

## Добавление новой AI модели

### Через Django Shell

```bash
docker compose exec backend python manage.py shell
```

```python
from apps.ai_providers.models import AIProvider, AIModel

# Найти провайдера
provider = AIProvider.objects.get(name="Kie.ai")

# Создать модель
AIModel.objects.create(
    provider=provider,
    name="New Model",
    model_type="IMAGE",  # или "VIDEO"
    api_endpoint="/api/endpoint",
    request_schema={
        "model": "model-name",
        "input": {
            "prompt": "{{prompt}}",
            "param": "{{param_name}}"
        }
    },
    parameters_schema={
        "param_name": {
            "type": "select",
            "label": "Parameter",
            "default": "value1",
            "options": ["value1", "value2"]
        }
    },
    is_active=True
)
```

### Важные правила

1. **request_schema** - точная копия API запроса из документации провайдера
2. Замените динамические значения на `{{variable}}`
3. Массивы должны быть массивами: `["{{url}}"]`, не `"{{url}}"`
4. Доступные переменные:
   - `{{prompt}}` - из Asset.prompt_text
   - `{{image_url}}` - из parent_asset.file_url
   - Любые другие из generation_config

## Логи и отладка

```bash
# Логи Celery
docker compose logs -f celery

# Логи backend
docker compose logs -f backend

# Все логи
docker compose logs -f

# Shell для проверки
docker compose exec backend python manage.py shell

# Проверить Asset
from apps.assets.models import Asset
asset = Asset.objects.get(id=6)
print(f"Status: {asset.status}")
print(f"Task ID: {asset.external_task_id}")
print(f"Error: {asset.error_message}")
print(f"File URL: {asset.file_url}")
```

## Частые проблемы

### 1. Celery не запущен
```bash
docker compose restart celery
docker compose logs celery
```

### 2. Запрос не уходит к провайдеру
- Проверьте API ключ в AIProvider
- Проверьте request_schema (должна совпадать с документацией)
- Логи Celery покажут отправленный Body

### 3. Ошибка 422 "Model not supported"
- Проверьте поле `"model"` в request_schema
- Оно должно точно совпадать с документацией провайдера

### 4. Ошибка 500 "File type not supported"
- Проверьте что `input_urls` - массив: `["{{image_url}}"]`
- Проверьте что файл на S3 доступен публично

## Документация

- **Полное руководство**: `backend/apps/ai_providers/README.md`
- **Быстрый старт**: `backend/apps/ai_providers/QUICKSTART.md`
- **API примеры**: `backend/API_README.md`
- **Отчет о работе**: `DONE_AI_GENERATION.md`

## Management команды

```bash
# Автоматическая настройка Kie.ai
docker compose exec backend python manage.py setup_kie_ai --api-key YOUR_KEY

# Список всех моделей
docker compose exec backend python manage.py list_ai_models

# Тест генерации изображения
docker compose exec backend python manage.py test_generation

# Тест генерации видео
docker compose exec backend python manage.py test_video_generation

# Тест Celery
docker compose exec backend python manage.py test_celery
```

---

**Всё готово к использованию!** 🎉
