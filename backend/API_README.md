# REST API - AI Asset Manager

## 🌐 Базовый URL
```
http://localhost:8000/api/
```

## 📋 Доступные endpoints

### 1. Projects API
**Base:** `/api/projects/`

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/projects/` | Список проектов пользователя |
| POST | `/api/projects/` | Создать проект |
| GET | `/api/projects/{id}/` | Детали проекта |
| PUT/PATCH | `/api/projects/{id}/` | Обновить проект |
| DELETE | `/api/projects/{id}/` | Удалить проект |

**Особенности:**
- ✅ `boxes_count` - количество боксов в проекте
- ✅ Автоматическая привязка к текущему пользователю
- ✅ Доступ только к своим проектам

**Документация:** `backend/apps/projects/API_DOCS.md`

---

### 2. Boxes API
**Base:** `/api/boxes/`

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/boxes/` | Список боксов пользователя |
| GET | `/api/boxes/?project=123` | Боксы конкретного проекта |
| POST | `/api/boxes/` | Создать бокс |
| GET | `/api/boxes/{id}/` | Детали бокса |
| PUT/PATCH | `/api/boxes/{id}/` | Обновить бокс |
| DELETE | `/api/boxes/{id}/` | Удалить бокс |

**Особенности:**
- ✅ `assets_count` - количество ассетов
- ✅ `project_name` - название проекта
- ✅ Фильтрация по project
- ✅ Проверка владения проектом при создании

**Документация:** `backend/apps/boxes/API_DOCS.md`

---

### 3. Assets API
**Base:** `/api/assets/`

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/assets/` | Список ассетов пользователя |
| GET | `/api/assets/?box=123` | Ассеты конкретного бокса |
| GET | `/api/assets/?asset_type=IMAGE` | Только изображения |
| GET | `/api/assets/?is_favorite=true` | Только избранные |
| POST | `/api/assets/` | Создать ассет |
| GET | `/api/assets/{id}/` | Детали ассета |
| PUT/PATCH | `/api/assets/{id}/` | Обновить ассет |
| DELETE | `/api/assets/{id}/` | Удалить ассет |

**Особенности:**
- ✅ `box_name` - название бокса
- ✅ `ai_model_name` - название AI модели
- ✅ 3 фильтра: box, asset_type, is_favorite
- ✅ Комбинированная фильтрация
- ✅ Поддержка AI generation config
- ✅ Статусы генерации: PENDING/PROCESSING/COMPLETED/FAILED
- ✅ Отслеживание source_type: GENERATED/UPLOADED/IMG2VID

**Документация:** `backend/apps/assets/API_DOCS.md`

---

### 4. File Upload (S3)
**Base:** `/api/boxes/{id}/`

| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/api/boxes/{id}/upload/` | Загрузить файл на S3 и создать Asset |

**Особенности:**
- ✅ Автоматическое определение типа (IMAGE/VIDEO) по расширению
- ✅ Уникальные имена файлов через UUID
- ✅ Публичный доступ к файлам
- ✅ Кеширование (Cache-Control: max-age=86400)
- ✅ Возвращает созданный Asset

**Документация:** `backend/apps/boxes/S3_UPLOAD_DOCS.md`

---

### 5. AI Generation
**Base:** `/api/boxes/{id}/`

| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/api/boxes/{id}/generate/` | Запустить AI генерацию (изображение/видео) |

**Особенности:**
- ✅ Универсальная система через AIProvider/AIModel
- ✅ Поддержка любых AI провайдеров (Kie.ai, Replicate, Stability и т.д.)
- ✅ Асинхронная генерация через Celery
- ✅ Автоматический polling результатов
- ✅ Автоматическая загрузка результатов на S3
- ✅ Поддержка img2vid (video из image)
- ✅ Отслеживание статуса в реальном времени

**Документация:** 
- API: `backend/apps/boxes/API_DOCS.md`
- AI Providers: `backend/apps/ai_providers/README.md`
- Quickstart: `backend/apps/ai_providers/QUICKSTART.md`

---

## 🔐 Аутентификация

Все endpoints требуют аутентификации:

```bash
curl -H "Authorization: Token YOUR_TOKEN" \
  http://localhost:8000/api/projects/
```

## 🎯 Permissions

### IsOwner (Projects)
Пользователь может работать только со **своими проектами**.

```python
obj.user == request.user
```

### IsProjectOwner (Boxes)
Пользователь может работать только с боксами **своих проектов**.

```python
obj.project.user == request.user
```

### IsBoxProjectOwner (Assets)
Пользователь может работать только с ассетами боксов **своих проектов**.

```python
obj.box.project.user == request.user
```

## 📊 Примеры использования

### Создать проект
```bash
curl -X POST http://localhost:8000/api/projects/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Video Project"}'
```

**Response:**
```json
{
  "id": 1,
  "name": "My Video Project",
  "boxes_count": 0,
  "created_at": "2026-02-08T00:00:00Z",
  "updated_at": "2026-02-08T00:00:00Z"
}
```

### Создать бокс в проекте
```bash
curl -X POST http://localhost:8000/api/boxes/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project": 1,
    "name": "Scene 1",
    "order_index": 0
  }'
```

**Response:**
```json
{
  "id": 1,
  "project": 1,
  "project_name": "My Video Project",
  "name": "Scene 1",
  "order_index": 0,
  "assets_count": 0,
  "created_at": "2026-02-08T00:00:00Z",
  "updated_at": "2026-02-08T00:00:00Z"
}
```

### Загрузить изображение на S3
```bash
curl -X POST http://localhost:8000/api/boxes/1/upload/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -F "file=@/path/to/image.jpg" \
  -F "prompt_text=Source image for video"
```

**Response:**
```json
{
  "id": 2,
  "box": 1,
  "box_name": "Scene 1",
  "asset_type": "IMAGE",
  "file_url": "https://s3.timeweb.com/bucket/uploads/image_abc123.jpg",
  "status": "COMPLETED",
  "source_type": "UPLOADED",
  "created_at": "2026-02-08T00:00:00Z"
}
```

### Запустить AI генерацию видео из изображения
```bash
curl -X POST http://localhost:8000/api/boxes/1/generate/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Two people arm wrestling in a vintage room, dynamic movement",
    "ai_model_id": 2,
    "parent_asset_id": 2,
    "generation_config": {
      "aspect_ratio": "16:9",
      "resolution": "720p",
      "duration": "8"
    }
  }'
```

**Response:**
```json
{
  "id": 3,
  "box": 1,
  "box_name": "Scene 1",
  "asset_type": "VIDEO",
  "status": "PENDING",
  "status_display": "В ожидании",
  "source_type": "IMG2VID",
  "source_type_display": "Видео из изображения",
  "prompt_text": "Two people arm wrestling in a vintage room, dynamic movement",
  "ai_model": 2,
  "ai_model_name": "Seedance 1.5 Pro",
  "parent_asset": 2,
  "generation_config": {
    "aspect_ratio": "16:9",
    "resolution": "720p",
    "duration": "8"
  },
  "external_task_id": "",
  "created_at": "2026-02-08T00:00:00Z"
}
```

После завершения генерации (30-60 секунд) статус изменится на `COMPLETED` и появится `file_url`.

### Создать ассет вручную
```bash
curl -X POST http://localhost:8000/api/assets/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "box": 1,
    "asset_type": "IMAGE",
    "file_url": "https://s3.example.com/image.jpg",
    "thumbnail_url": "https://s3.example.com/thumb.jpg",
    "prompt_text": "A beautiful sunset",
    "ai_model": 2,
    "generation_config": {
      "width": 1024,
      "height": 768,
      "steps": 30
    },
    "seed": 12345
  }'
```

**Response:**
```json
{
  "id": 1,
  "box": 1,
  "box_name": "Scene 1",
  "asset_type": "IMAGE",
  "file_url": "https://s3.example.com/image.jpg",
  "thumbnail_url": "https://s3.example.com/thumb.jpg",
  "is_favorite": false,
  "prompt_text": "A beautiful sunset",
  "ai_model": 2,
  "ai_model_name": "Nano Banana",
  "generation_config": {
    "width": 1024,
    "height": 768,
    "steps": 30
  },
  "seed": 12345,
  "status": "COMPLETED",
  "source_type": "GENERATED",
  "created_at": "2026-02-08T00:00:00Z",
  "updated_at": "2026-02-08T00:00:00Z"
}
```

### Получить избранные изображения
```bash
curl -H "Authorization: Token YOUR_TOKEN" \
  "http://localhost:8000/api/assets/?asset_type=IMAGE&is_favorite=true"
```

### Отметить как избранное
```bash
curl -X PATCH http://localhost:8000/api/assets/1/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_favorite": true}'
```

## 🔍 Фильтрация

### Boxes
- `?project=123` - боксы конкретного проекта

### Assets
- `?box=123` - ассеты конкретного бокса
- `?asset_type=IMAGE` - только изображения
- `?asset_type=VIDEO` - только видео
- `?is_favorite=true` - только избранные
- `?is_favorite=false` - не избранные

**Комбинирование:**
```bash
# Избранные изображения бокса 5
/api/assets/?box=5&asset_type=IMAGE&is_favorite=true
```

## ⚡ Оптимизация

Все ViewSets используют `select_related` и `prefetch_related` для минимизации запросов к БД:

```python
# Projects
.prefetch_related('boxes')

# Boxes
.select_related('project').prefetch_related('assets')

# Assets
.select_related('box', 'box__project', 'ai_model')
```

**Результат:** Нет N+1 проблемы даже для больших списков!

## 🧪 Тестирование

Все API полностью покрыты тестами:

```bash
# Запустить все тесты
docker compose exec backend python manage.py test

# Результат
Found 100 test(s).
Ran 100 tests in 11.584s
OK ✓
```

**Breakdown:**
- Projects API: 10 тестов ✓
- Boxes API: 13 тестов ✓
- Assets API: 14 тестов ✓

## 📝 JavaScript примеры

### React Hook для работы с API

```javascript
// useAssets.js
import { useState, useEffect } from 'react';

export const useAssets = (boxId, filters = {}) => {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({
      box: boxId,
      ...filters
    });

    fetch(`/api/assets/?${params}`, {
      headers: {
        'Authorization': `Token ${localStorage.getItem('token')}`
      }
    })
    .then(res => res.json())
    .then(data => {
      setAssets(data);
      setLoading(false);
    });
  }, [boxId, filters]);

  return { assets, loading };
};

// Использование
const AssetGallery = ({ boxId }) => {
  const { assets, loading } = useAssets(boxId, {
    asset_type: 'IMAGE',
    is_favorite: true
  });

  if (loading) return <div>Loading...</div>;

  return (
    <div className="gallery">
      {assets.map(asset => (
        <img
          key={asset.id}
          src={asset.thumbnail_url}
          alt={asset.prompt_text}
        />
      ))}
    </div>
  );
};
```

### Axios пример

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000/api',
  headers: {
    'Authorization': `Token ${localStorage.getItem('token')}`
  }
});

// Получить проекты
const projects = await api.get('/projects/');

// Создать бокс
const box = await api.post('/boxes/', {
  project: 1,
  name: 'Scene 1',
  order_index: 0
});

// Получить избранные изображения
const favorites = await api.get('/assets/', {
  params: {
    asset_type: 'IMAGE',
    is_favorite: true
  }
});

// Отметить как избранное
await api.patch(`/assets/${assetId}/`, {
  is_favorite: true
});
```

## 📚 Детальная документация

Каждое API имеет подробную документацию:

1. **Projects API** - `backend/apps/projects/API_DOCS.md`
2. **Boxes API** - `backend/apps/boxes/API_DOCS.md`
3. **Assets API** - `backend/apps/assets/API_DOCS.md`

В документации вы найдете:
- Полный список endpoints
- Примеры запросов и ответов
- Описание всех полей
- Примеры с curl
- Примеры с JavaScript/React
- Информацию о permissions
- Примеры фильтрации

## 🚀 Следующие шаги

### Планируется добавить:
1. **Nested routing**
   - `/api/projects/{id}/boxes/`
   - `/api/boxes/{id}/assets/`

2. **Custom actions**
   - `POST /api/boxes/{id}/reorder/` - массовое изменение order_index
   - `POST /api/assets/{id}/favorite/` - toggle favorite
   - `POST /api/assets/{id}/animate/` - img2vid конвертация

3. **Authentication**
   - `/api/auth/register/`
   - `/api/auth/login/`
   - `/api/auth/logout/`

4. **Пагинация**
   - PageNumberPagination для больших списков

5. **Поиск**
   - SearchFilter по различным полям
   - Полнотекстовый поиск по prompt_text

## ✅ Статус

- ✅ **Projects API** - полностью готов
- ✅ **Boxes API** - полностью готов
- ✅ **Assets API** - полностью готов
- ✅ Все тесты проходят (100/100)
- ✅ Документация готова
- ✅ Примеры использования готовы

**API готов к использованию!** 🎉
