# Boxes REST API

REST API для работы с боксами (шотами), реализованное на Django REST Framework.

## Endpoints

### Base URL
```
/api/boxes/
```

### Список endpoints

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/boxes/` | Список боксов пользователя |
| GET | `/api/boxes/?project=123` | Боксы конкретного проекта |
| POST | `/api/boxes/` | Создать новый бокс |
| GET | `/api/boxes/{id}/` | Получить детали бокса |
| PUT | `/api/boxes/{id}/` | Обновить бокс полностью |
| PATCH | `/api/boxes/{id}/` | Частично обновить бокс |
| DELETE | `/api/boxes/{id}/` | Удалить бокс |
| **POST** | **`/api/boxes/{id}/upload/`** | **Загрузить файл на S3 и создать Asset** |

## Аутентификация

Все endpoints требуют аутентификации:

```bash
curl -H "Authorization: Token YOUR_TOKEN" http://localhost:8000/api/boxes/
```

## Permissions

- ✅ **IsAuthenticated** - только авторизованные пользователи
- ✅ **IsProjectOwner** - пользователь видит только боксы своих проектов
- ✅ **Валидация при создании** - проверка, что project принадлежит пользователю

## Фильтрация

### По проекту
```bash
GET /api/boxes/?project=123
```

Возвращает только боксы проекта с ID=123 (если он принадлежит пользователю).

## Примеры запросов

### 1. Получить все боксы пользователя

```bash
GET /api/boxes/
```

**Response 200 OK:**
```json
[
  {
    "id": 1,
    "project": 5,
    "project_name": "Мой проект",
    "name": "Сцена 1",
    "order_index": 0,
    "assets_count": 15,
    "created_at": "2026-02-08T10:30:00Z",
    "updated_at": "2026-02-08T12:00:00Z"
  },
  {
    "id": 2,
    "project": 5,
    "project_name": "Мой проект",
    "name": "Сцена 2",
    "order_index": 1,
    "assets_count": 8,
    "created_at": "2026-02-08T11:00:00Z",
    "updated_at": "2026-02-08T11:30:00Z"
  }
]
```

### 2. Получить боксы конкретного проекта

```bash
GET /api/boxes/?project=5
```

**Response 200 OK:**
```json
[
  {
    "id": 1,
    "project": 5,
    "project_name": "Мой проект",
    "name": "Сцена 1",
    "order_index": 0,
    "assets_count": 15,
    "created_at": "2026-02-08T10:30:00Z",
    "updated_at": "2026-02-08T12:00:00Z"
  }
]
```

### 3. Создать бокс

```bash
POST /api/boxes/
Content-Type: application/json

{
  "project": 5,
  "name": "Новая сцена",
  "order_index": 3
}
```

**Response 201 Created:**
```json
{
  "id": 10,
  "project": 5,
  "project_name": "Мой проект",
  "name": "Новая сцена",
  "order_index": 3,
  "assets_count": 0,
  "created_at": "2026-02-08T14:30:00Z",
  "updated_at": "2026-02-08T14:30:00Z"
}
```

**Response 400 Bad Request** (если project чужой):
```json
{
  "project": ["Project not found or you do not have permission."]
}
```

### 4. Получить детали бокса

```bash
GET /api/boxes/1/
```

**Response 200 OK:**
```json
{
  "id": 1,
  "project": 5,
  "project_name": "Мой проект",
  "name": "Сцена 1",
  "order_index": 0,
  "assets_count": 15,
  "created_at": "2026-02-08T10:30:00Z",
  "updated_at": "2026-02-08T12:00:00Z"
}
```

### 5. Обновить бокс (PATCH)

```bash
PATCH /api/boxes/1/
Content-Type: application/json

{
  "name": "Обновленное название",
  "order_index": 5
}
```

**Response 200 OK:**
```json
{
  "id": 1,
  "project": 5,
  "project_name": "Мой проект",
  "name": "Обновленное название",
  "order_index": 5,
  "assets_count": 15,
  "created_at": "2026-02-08T10:30:00Z",
  "updated_at": "2026-02-08T15:00:00Z"
}
```

### 6. Удалить бокс

```bash
DELETE /api/boxes/1/
```

**Response 204 No Content**

## Поля модели

### BoxSerializer

| Поле | Тип | Описание | Read-only |
|------|-----|----------|-----------|
| `id` | integer | ID бокса | ✓ |
| `project` | integer | ID проекта (FK) | - |
| `project_name` | string | Название проекта | ✓ |
| `name` | string | Название бокса | - |
| `order_index` | integer | Порядковый номер | - |
| `assets_count` | integer | Количество ассетов | ✓ |
| `created_at` | datetime | Дата создания | ✓ |
| `updated_at` | datetime | Дата обновления | ✓ |

### SerializerMethodFields

- **assets_count** - подсчитывает `obj.assets.count()`
- **project_name** - возвращает `obj.project.name`

## Примеры с curl

### Получить боксы проекта
```bash
curl -H "Authorization: Token YOUR_TOKEN" \
  "http://localhost:8000/api/boxes/?project=5"
```

### Создать бокс
```bash
curl -X POST http://localhost:8000/api/boxes/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project": 5,
    "name": "Новая сцена",
    "order_index": 3
  }'
```

### Обновить order_index
```bash
curl -X PATCH http://localhost:8000/api/boxes/1/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"order_index": 10}'
```

## Примеры с JavaScript

```javascript
// Получить боксы проекта
const response = await fetch('/api/boxes/?project=5', {
  headers: {
    'Authorization': 'Token YOUR_TOKEN'
  }
});
const boxes = await response.json();

// Создать бокс
const response = await fetch('/api/boxes/', {
  method: 'POST',
  headers: {
    'Authorization': 'Token YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    project: projectId,
    name: 'Новая сцена',
    order_index: 0
  })
});
const box = await response.json();

// Обновить порядок
const response = await fetch(`/api/boxes/${boxId}/`, {
  method: 'PATCH',
  headers: {
    'Authorization': 'Token YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    order_index: newIndex
  })
});
```

## Оптимизация

ViewSet использует оптимизацию запросов:

```python
def get_queryset(self):
    return Box.objects.filter(
        project__user=self.request.user
    ).select_related('project').prefetch_related('assets')
```

- `select_related('project')` - загружает project одним запросом
- `prefetch_related('assets')` - оптимизирует подсчет assets_count
- Фильтрация по `project__user` через вложенный FK

## Тесты

API полностью покрыт тестами:
- ✅ Список боксов (только своих проектов)
- ✅ Фильтрация по project
- ✅ Создание бокса
- ✅ Проверка, что нельзя создать в чужом проекте
- ✅ Получение деталей
- ✅ Обновление (PUT/PATCH)
- ✅ Удаление
- ✅ Проверка permissions (IsProjectOwner)
- ✅ Проверка assets_count и project_name
- ✅ **Загрузка файла на S3**
- ✅ **Загрузка видео файла**
- ✅ **Ошибка при отсутствии файла**
- ✅ **Ошибка при загрузке в чужой бокс**

Все 17 API тестов в `test_api.py` проходят успешно.

## S3 Upload Endpoint

### POST /api/boxes/{id}/upload/

Загружает файл на S3 и автоматически создает Asset.

**Parameters:**
- `file` (required) - файл для загрузки
- `prompt_text` (optional) - текст промпта
- `is_favorite` (optional) - флаг избранного
- `ai_model` (optional) - ID AI модели

**Example:**
```bash
curl -X POST http://localhost:8000/api/boxes/1/upload/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -F "file=@image.jpg" \
  -F "prompt_text=Beautiful sunset" \
  -F "is_favorite=true"
```

**Response:**
```json
{
  "id": 10,
  "box": 1,
  "box_name": "Scene 1",
  "asset_type": "IMAGE",
  "file_url": "https://ai-production-asset-managemer.s3.timeweb.com/uploads/abc123.jpg",
  "thumbnail_url": "",
  "is_favorite": true,
  "prompt_text": "Beautiful sunset",
  "ai_model": null,
  "ai_model_name": null,
  "generation_config": {},
  "seed": null,
  "created_at": "2026-02-08T01:00:00Z",
  "updated_at": "2026-02-08T01:00:00Z"
}
```

**Особенности:**
- ✅ Автоматическое определение типа (IMAGE/VIDEO) по расширению
- ✅ Уникальные имена файлов (UUID)
- ✅ Публичный доступ к файлам
- ✅ Интеграция с django-storages + boto3

Подробная документация: **[S3_UPLOAD_DOCS.md](S3_UPLOAD_DOCS.md)**

## Структура файлов

```
apps/boxes/
├── serializers.py          # BoxSerializer + assets_count + project_name
├── views.py                # BoxViewSet + IsProjectOwner + upload action
├── urls.py                 # Router configuration
├── s3_utils.py             # S3 utilities (upload, detect_type, delete)
├── test_api.py             # API tests (17 тестов)
├── API_DOCS.md             # Эта документация
└── S3_UPLOAD_DOCS.md       # Детальная документация upload endpoint
```

## Следующие шаги

После реализации API для Boxes и S3 upload, можно добавить:
1. **Thumbnail генерация** - автоматическое создание превью
2. Custom action для reorder: `POST /api/boxes/reorder/`
3. **Валидация размера файлов** - ограничения на размер
4. Nested routing: `/api/projects/{id}/boxes/`
5. Пагинацию для больших списков
