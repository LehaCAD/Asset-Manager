# Assets REST API

REST API для работы с ассетами (изображениями и видео), реализованное на Django REST Framework.

## Endpoints

### Base URL
```
/api/assets/
```

### Список endpoints

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/assets/` | Список ассетов пользователя |
| GET | `/api/assets/?box=123` | Ассеты конкретного бокса |
| GET | `/api/assets/?asset_type=IMAGE` | Фильтр по типу |
| GET | `/api/assets/?is_favorite=true` | Только избранные |
| POST | `/api/assets/` | Создать новый ассет |
| GET | `/api/assets/{id}/` | Получить детали ассета |
| PUT | `/api/assets/{id}/` | Обновить ассет полностью |
| PATCH | `/api/assets/{id}/` | Частично обновить ассет |
| DELETE | `/api/assets/{id}/` | Удалить ассет |

## Аутентификация

Все endpoints требуют аутентификации:

```bash
curl -H "Authorization: Token YOUR_TOKEN" http://localhost:8000/api/assets/
```

## Permissions

- ✅ **IsAuthenticated** - только авторизованные пользователи
- ✅ **IsBoxProjectOwner** - пользователь видит только ассеты боксов своих проектов
- ✅ Проверка через вложенный FK: `box.project.user`

## Фильтрация

### 1. По боксу
```bash
GET /api/assets/?box=123
```

Возвращает только ассеты бокса с ID=123 (если бокс принадлежит пользователю).

### 2. По типу ассета
```bash
GET /api/assets/?asset_type=IMAGE   # Только изображения
GET /api/assets/?asset_type=VIDEO   # Только видео
```

### 3. По избранному
```bash
GET /api/assets/?is_favorite=true   # Только избранные
GET /api/assets/?is_favorite=false  # Не избранные
```

### 4. Комбинированная фильтрация
```bash
GET /api/assets/?box=123&asset_type=IMAGE&is_favorite=true
```

Возвращает избранные изображения из бокса 123.

## Примеры запросов

### 1. Получить все ассеты пользователя

```bash
GET /api/assets/
```

**Response 200 OK:**
```json
[
  {
    "id": 1,
    "box": 5,
    "box_name": "Сцена 1",
    "asset_type": "IMAGE",
    "file_url": "https://s3.example.com/image1.jpg",
    "thumbnail_url": "https://s3.example.com/thumb1.jpg",
    "is_favorite": true,
    "prompt_text": "A beautiful sunset over mountains",
    "ai_model": 2,
    "ai_model_name": "Nano Banana",
    "generation_config": {
      "width": 1024,
      "height": 768,
      "steps": 30
    },
    "seed": 12345,
    "created_at": "2026-02-08T10:30:00Z",
    "updated_at": "2026-02-08T12:00:00Z"
  }
]
```

### 2. Получить ассеты бокса

```bash
GET /api/assets/?box=5
```

**Response 200 OK:**
```json
[
  {
    "id": 1,
    "box": 5,
    "box_name": "Сцена 1",
    "asset_type": "IMAGE",
    "file_url": "https://s3.example.com/image1.jpg",
    "thumbnail_url": "https://s3.example.com/thumb1.jpg",
    "is_favorite": true,
    "prompt_text": "A beautiful sunset",
    "ai_model": 2,
    "ai_model_name": "Nano Banana",
    "generation_config": {"width": 1024},
    "seed": 12345,
    "created_at": "2026-02-08T10:30:00Z",
    "updated_at": "2026-02-08T12:00:00Z"
  }
]
```

### 3. Получить только избранные изображения

```bash
GET /api/assets/?asset_type=IMAGE&is_favorite=true
```

### 4. Создать ассет

```bash
POST /api/assets/
Content-Type: application/json

{
  "box": 5,
  "asset_type": "IMAGE",
  "file_url": "https://s3.example.com/new.jpg",
  "thumbnail_url": "https://s3.example.com/new_thumb.jpg",
  "prompt_text": "A beautiful landscape",
  "ai_model": 2,
  "generation_config": {
    "width": 1024,
    "height": 768
  },
  "seed": 67890,
  "is_favorite": false
}
```

**Response 201 Created:**
```json
{
  "id": 10,
  "box": 5,
  "box_name": "Сцена 1",
  "asset_type": "IMAGE",
  "file_url": "https://s3.example.com/new.jpg",
  "thumbnail_url": "https://s3.example.com/new_thumb.jpg",
  "is_favorite": false,
  "prompt_text": "A beautiful landscape",
  "ai_model": 2,
  "ai_model_name": "Nano Banana",
  "generation_config": {
    "width": 1024,
    "height": 768
  },
  "seed": 67890,
  "created_at": "2026-02-08T14:30:00Z",
  "updated_at": "2026-02-08T14:30:00Z"
}
```

### 5. Отметить как избранное

```bash
PATCH /api/assets/1/
Content-Type: application/json

{
  "is_favorite": true
}
```

**Response 200 OK:**
```json
{
  "id": 1,
  "box": 5,
  "box_name": "Сцена 1",
  "asset_type": "IMAGE",
  "file_url": "https://s3.example.com/image1.jpg",
  "thumbnail_url": "https://s3.example.com/thumb1.jpg",
  "is_favorite": true,
  ...
}
```

### 6. Удалить ассет

```bash
DELETE /api/assets/1/
```

**Response 204 No Content**

## Поля модели

### AssetSerializer

| Поле | Тип | Описание | Read-only |
|------|-----|----------|-----------|
| `id` | integer | ID ассета | ✓ |
| `box` | integer | ID бокса (FK) | - |
| `box_name` | string | Название бокса | ✓ |
| `asset_type` | string | Тип (IMAGE/VIDEO) | - |
| `file_url` | string (URL) | URL файла | - |
| `thumbnail_url` | string (URL) | URL превью | - |
| `is_favorite` | boolean | Избранное | - |
| `prompt_text` | string | Текст промпта | - |
| `ai_model` | integer | ID AI модели (FK) | - |
| `ai_model_name` | string | Название AI модели | ✓ |
| `generation_config` | object (JSON) | Параметры генерации | - |
| `seed` | integer | Seed генерации | - |
| `created_at` | datetime | Дата создания | ✓ |
| `updated_at` | datetime | Дата обновления | ✓ |

### SerializerMethodFields

- **box_name** - возвращает `obj.box.name`
- **ai_model_name** - возвращает `obj.ai_model.name` (или null)

## Примеры с curl

### Получить избранные изображения
```bash
curl -H "Authorization: Token YOUR_TOKEN" \
  "http://localhost:8000/api/assets/?asset_type=IMAGE&is_favorite=true"
```

### Создать ассет
```bash
curl -X POST http://localhost:8000/api/assets/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "box": 5,
    "asset_type": "IMAGE",
    "file_url": "https://s3.example.com/new.jpg",
    "prompt_text": "A beautiful sunset"
  }'
```

### Отметить как избранное
```bash
curl -X PATCH http://localhost:8000/api/assets/1/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_favorite": true}'
```

## Примеры с JavaScript

```javascript
// Получить ассеты бокса
const fetchBoxAssets = async (boxId) => {
  const response = await fetch(`/api/assets/?box=${boxId}`, {
    headers: {
      'Authorization': `Token ${token}`
    }
  });
  const assets = await response.json();
  return assets;
};

// Получить только избранные изображения
const fetchFavoriteImages = async () => {
  const response = await fetch('/api/assets/?asset_type=IMAGE&is_favorite=true', {
    headers: {
      'Authorization': `Token ${token}`
    }
  });
  const favorites = await response.json();
  return favorites;
};

// Создать ассет
const createAsset = async (boxId, data) => {
  const response = await fetch('/api/assets/', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      box: boxId,
      asset_type: 'IMAGE',
      file_url: data.fileUrl,
      thumbnail_url: data.thumbnailUrl,
      prompt_text: data.prompt,
      ai_model: data.modelId,
      generation_config: data.config,
      seed: data.seed
    })
  });
  const asset = await response.json();
  return asset;
};

// Переключить избранное
const toggleFavorite = async (assetId, isFavorite) => {
  const response = await fetch(`/api/assets/${assetId}/`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      is_favorite: isFavorite
    })
  });
  const asset = await response.json();
  return asset;
};
```

## Оптимизация

ViewSet использует многоуровневую оптимизацию:

```python
def get_queryset(self):
    return Asset.objects.filter(
        box__project__user=self.request.user
    ).select_related('box', 'box__project', 'ai_model')
```

**Преимущества:**
- `box__project__user` - фильтрация через вложенный FK
- `select_related('box', 'box__project')` - загрузка связей одним запросом
- `select_related('ai_model')` - загрузка AI модели для ai_model_name

**Результат:** Минимум запросов к БД даже для больших списков!

## Примеры использования в UI

### Галерея ассетов бокса

```javascript
// React компонент
const AssetGallery = ({ boxId }) => {
  const [assets, setAssets] = useState([]);
  
  useEffect(() => {
    fetch(`/api/assets/?box=${boxId}`, {
      headers: { 'Authorization': `Token ${token}` }
    })
    .then(res => res.json())
    .then(data => setAssets(data));
  }, [boxId]);
  
  return (
    <div className="gallery">
      {assets.map(asset => (
        <div key={asset.id}>
          <img src={asset.thumbnail_url} alt={asset.prompt_text} />
          <p>{asset.box_name}</p>
          <p>Model: {asset.ai_model_name}</p>
          <button onClick={() => toggleFavorite(asset.id, !asset.is_favorite)}>
            {asset.is_favorite ? '⭐' : '☆'}
          </button>
        </div>
      ))}
    </div>
  );
};
```

### Фильтр избранных

```javascript
const FavoritesView = ({ projectId }) => {
  const [favorites, setFavorites] = useState([]);
  
  useEffect(() => {
    // Получить все боксы проекта
    fetch(`/api/boxes/?project=${projectId}`)
      .then(res => res.json())
      .then(boxes => {
        // Получить избранные ассеты
        return fetch('/api/assets/?is_favorite=true');
      })
      .then(res => res.json())
      .then(data => setFavorites(data));
  }, [projectId]);
  
  return <Gallery assets={favorites} />;
};
```

## Тесты

API полностью покрыт тестами:
- ✅ Список ассетов (только своих проектов)
- ✅ Фильтрация по box
- ✅ Фильтрация по asset_type (IMAGE/VIDEO)
- ✅ Фильтрация по is_favorite (true/false)
- ✅ Комбинированная фильтрация
- ✅ Создание ассета
- ✅ Получение деталей
- ✅ Обновление (PUT/PATCH)
- ✅ Удаление
- ✅ Проверка permissions (IsBoxProjectOwner)
- ✅ Проверка box_name и ai_model_name

Все 14 API тестов в `test_api.py` проходят успешно.

## Структура файлов

```
apps/assets/
├── serializers.py          # AssetSerializer + box_name + ai_model_name
├── views.py                # AssetViewSet + IsBoxProjectOwner + 3 фильтра
├── urls.py                 # Router configuration
├── test_api.py             # API tests (14 тестов)
└── API_DOCS.md             # Эта документация
```

## Фильтры в деталях

### Реализация в get_queryset()

```python
def get_queryset(self):
    queryset = Asset.objects.filter(
        box__project__user=self.request.user
    ).select_related('box', 'box__project', 'ai_model')
    
    # Фильтр по box
    box_id = self.request.query_params.get('box', None)
    if box_id is not None:
        queryset = queryset.filter(box_id=box_id)
    
    # Фильтр по asset_type
    asset_type = self.request.query_params.get('asset_type', None)
    if asset_type is not None:
        queryset = queryset.filter(asset_type=asset_type)
    
    # Фильтр по is_favorite
    is_favorite = self.request.query_params.get('is_favorite', None)
    if is_favorite is not None:
        is_fav_bool = is_favorite.lower() in ('true', '1', 'yes')
        queryset = queryset.filter(is_favorite=is_fav_bool)
    
    return queryset
```

### Примеры URL

```
# Все ассеты
/api/assets/

# Ассеты бокса 5
/api/assets/?box=5

# Изображения бокса 5
/api/assets/?box=5&asset_type=IMAGE

# Избранные изображения
/api/assets/?asset_type=IMAGE&is_favorite=true

# Избранные видео бокса 5
/api/assets/?box=5&asset_type=VIDEO&is_favorite=true
```

## Поддержка AI генерации

Сериализатор включает все поля для AI:

```json
{
  "ai_model": 2,
  "ai_model_name": "Nano Banana",
  "generation_config": {
    "width": 1024,
    "height": 768,
    "steps": 30,
    "guidance_scale": 7.5
  },
  "seed": 12345,
  "prompt_text": "A beautiful sunset"
}
```

Это позволяет:
- Видеть, какая модель создала ассет
- Воспроизвести генерацию с теми же параметрами
- Отобразить конфигурацию в UI

## Следующие шаги

После реализации базового API для Assets, можно добавить:
1. Custom actions:
   - `POST /api/assets/{id}/animate/` - img2vid конвертация
   - `POST /api/assets/{id}/favorite/` - toggle favorite
2. Nested routing:
   - `/api/boxes/{id}/assets/` вместо фильтра
3. Пагинация для больших галерей
4. Сортировка по разным полям
5. Поиск по prompt_text
