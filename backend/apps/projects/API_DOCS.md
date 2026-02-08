# Projects REST API

REST API для работы с проектами, реализованное на Django REST Framework.

## Endpoints

### Base URL
```
/api/projects/
```

### Список endpoints

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/projects/` | Список проектов пользователя |
| POST | `/api/projects/` | Создать новый проект |
| GET | `/api/projects/{id}/` | Получить детали проекта |
| PUT | `/api/projects/{id}/` | Обновить проект полностью |
| PATCH | `/api/projects/{id}/` | Частично обновить проект |
| DELETE | `/api/projects/{id}/` | Удалить проект |

## Аутентификация

Все endpoints требуют аутентификации. Используйте один из методов:

**Token Authentication:**
```bash
curl -H "Authorization: Token YOUR_TOKEN" http://localhost:8000/api/projects/
```

**Session Authentication:**
```bash
# После логина через Django
curl --cookie "sessionid=YOUR_SESSION" http://localhost:8000/api/projects/
```

## Permissions

- ✅ **IsAuthenticated** - только авторизованные пользователи
- ✅ **IsOwner** - пользователь видит и может изменять только свои проекты
- ✅ **Auto-assign user** - при создании автоматически устанавливается текущий пользователь

## Примеры запросов

### 1. Получить список проектов

```bash
GET /api/projects/
```

**Response 200 OK:**
```json
[
  {
    "id": 1,
    "name": "Мой проект",
    "boxes_count": 5,
    "created_at": "2026-02-08T10:30:00Z",
    "updated_at": "2026-02-08T12:00:00Z"
  },
  {
    "id": 2,
    "name": "Другой проект",
    "boxes_count": 0,
    "created_at": "2026-02-08T11:00:00Z",
    "updated_at": "2026-02-08T11:00:00Z"
  }
]
```

### 2. Создать проект

```bash
POST /api/projects/
Content-Type: application/json

{
  "name": "Новый проект"
}
```

**Response 201 Created:**
```json
{
  "id": 3,
  "name": "Новый проект",
  "boxes_count": 0,
  "created_at": "2026-02-08T14:30:00Z",
  "updated_at": "2026-02-08T14:30:00Z"
}
```

**Примечание:** Поле `user` устанавливается автоматически из `request.user`.

### 3. Получить детали проекта

```bash
GET /api/projects/1/
```

**Response 200 OK:**
```json
{
  "id": 1,
  "name": "Мой проект",
  "boxes_count": 5,
  "created_at": "2026-02-08T10:30:00Z",
  "updated_at": "2026-02-08T12:00:00Z"
}
```

**Response 404 Not Found:**
Если проект не существует или принадлежит другому пользователю.

### 4. Обновить проект (PUT)

```bash
PUT /api/projects/1/
Content-Type: application/json

{
  "name": "Обновленное название"
}
```

**Response 200 OK:**
```json
{
  "id": 1,
  "name": "Обновленное название",
  "boxes_count": 5,
  "created_at": "2026-02-08T10:30:00Z",
  "updated_at": "2026-02-08T15:00:00Z"
}
```

### 5. Частично обновить проект (PATCH)

```bash
PATCH /api/projects/1/
Content-Type: application/json

{
  "name": "Новое название"
}
```

**Response 200 OK:**
```json
{
  "id": 1,
  "name": "Новое название",
  "boxes_count": 5,
  "created_at": "2026-02-08T10:30:00Z",
  "updated_at": "2026-02-08T15:30:00Z"
}
```

### 6. Удалить проект

```bash
DELETE /api/projects/1/
```

**Response 204 No Content**

## Поля модели

### ProjectSerializer

| Поле | Тип | Описание | Read-only |
|------|-----|----------|-----------|
| `id` | integer | ID проекта | ✓ |
| `name` | string | Название проекта | - |
| `boxes_count` | integer | Количество боксов в проекте | ✓ |
| `created_at` | datetime | Дата создания | ✓ |
| `updated_at` | datetime | Дата обновления | ✓ |

### Особенности

**boxes_count** - это `SerializerMethodField`, который подсчитывает количество боксов через `obj.boxes.count()`.

## Коды ответов

| Код | Описание |
|-----|----------|
| 200 | OK - запрос выполнен успешно |
| 201 | Created - ресурс создан |
| 204 | No Content - ресурс удален |
| 400 | Bad Request - невалидные данные |
| 401 | Unauthorized - не авторизован |
| 403 | Forbidden - нет доступа |
| 404 | Not Found - ресурс не найден |

## Ошибки

### 401 Unauthorized
```json
{
  "detail": "Authentication credentials were not provided."
}
```

### 403 Forbidden
```json
{
  "detail": "You do not have permission to perform this action."
}
```

### 404 Not Found
```json
{
  "detail": "Not found."
}
```

### 400 Bad Request
```json
{
  "name": ["This field is required."]
}
```

## Примеры с curl

### Создать проект
```bash
curl -X POST http://localhost:8000/api/projects/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Мой новый проект"}'
```

### Получить список
```bash
curl http://localhost:8000/api/projects/ \
  -H "Authorization: Token YOUR_TOKEN"
```

### Обновить проект
```bash
curl -X PATCH http://localhost:8000/api/projects/1/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Обновленное название"}'
```

### Удалить проект
```bash
curl -X DELETE http://localhost:8000/api/projects/1/ \
  -H "Authorization: Token YOUR_TOKEN"
```

## Примеры с JavaScript (fetch)

```javascript
// Получить список проектов
const response = await fetch('/api/projects/', {
  headers: {
    'Authorization': 'Token YOUR_TOKEN'
  }
});
const projects = await response.json();

// Создать проект
const response = await fetch('/api/projects/', {
  method: 'POST',
  headers: {
    'Authorization': 'Token YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Новый проект'
  })
});
const project = await response.json();

// Обновить проект
const response = await fetch('/api/projects/1/', {
  method: 'PATCH',
  headers: {
    'Authorization': 'Token YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Обновленное название'
  })
});
const updated = await response.json();

// Удалить проект
await fetch('/api/projects/1/', {
  method: 'DELETE',
  headers: {
    'Authorization': 'Token YOUR_TOKEN'
  }
});
```

## Оптимизация

ViewSet использует `prefetch_related('boxes')` для оптимизации запроса при подсчете боксов:

```python
def get_queryset(self):
    return Project.objects.filter(
        user=self.request.user
    ).prefetch_related('boxes')
```

Это избегает N+1 запросов при получении списка проектов с `boxes_count`.

## Тесты

API полностью покрыт тестами:
- ✅ Список проектов (только свои)
- ✅ Создание проекта
- ✅ Получение деталей
- ✅ Обновление (PUT/PATCH)
- ✅ Удаление
- ✅ Проверка permissions (IsOwner)
- ✅ Проверка boxes_count
- ✅ Аутентификация

Все 10 API тестов в `test_api.py` проходят успешно.

## Структура файлов

```
apps/projects/
├── serializers.py          # ProjectSerializer
├── views.py                # ProjectViewSet + IsOwner
├── urls.py                 # Router configuration
├── test_api.py             # API tests (10 тестов)
└── API_DOCS.md             # Эта документация
```

## Следующие шаги

После реализации API для Projects, можно добавить:
1. API для Boxes (`/api/projects/{id}/boxes/`)
2. API для Assets (`/api/boxes/{id}/assets/`)
3. Фильтрацию и пагинацию
4. Поиск по названию
5. Сортировку
