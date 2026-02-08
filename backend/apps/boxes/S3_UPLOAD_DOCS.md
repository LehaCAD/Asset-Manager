# S3 Upload Endpoint - Документация

## 📤 Загрузка файлов на S3

### Endpoint
```
POST /api/boxes/{id}/upload/
```

### Описание
Загружает файл на S3 хранилище и автоматически создает Asset в указанном боксе.

### Аутентификация
Требуется авторизация. Пользователь может загружать файлы только в боксы своих проектов.

### Параметры

#### URL Parameters
- `id` (integer) - ID бокса

#### Body Parameters (multipart/form-data)
- `file` (file, required) - Файл для загрузки
- `prompt_text` (string, optional) - Текст промпта
- `is_favorite` (boolean, optional) - Флаг избранного (default: false)
- `ai_model` (integer, optional) - ID AI модели

### Определение типа файла

Тип ассета определяется автоматически по расширению файла:

**Изображения (IMAGE):**
- `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`, `.svg`

**Видео (VIDEO):**
- `.mp4`, `.mov`, `.avi`, `.mkv`, `.webm`, `.flv`, `.wmv`

### Примеры использования

#### 1. Загрузка изображения

```bash
curl -X POST http://localhost:8000/api/boxes/1/upload/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -F "file=@image.jpg" \
  -F "prompt_text=A beautiful sunset" \
  -F "is_favorite=true"
```

**Response 201 Created:**
```json
{
  "id": 10,
  "box": 1,
  "box_name": "Scene 1",
  "asset_type": "IMAGE",
  "file_url": "https://ai-production-asset-managemer.s3.timeweb.com/uploads/abc123def456.jpg",
  "thumbnail_url": "",
  "is_favorite": true,
  "prompt_text": "A beautiful sunset",
  "ai_model": null,
  "ai_model_name": null,
  "generation_config": {},
  "seed": null,
  "created_at": "2026-02-08T01:00:00Z",
  "updated_at": "2026-02-08T01:00:00Z"
}
```

#### 2. Загрузка видео

```bash
curl -X POST http://localhost:8000/api/boxes/1/upload/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -F "file=@video.mp4" \
  -F "prompt_text=Generated video"
```

**Response 201 Created:**
```json
{
  "id": 11,
  "box": 1,
  "box_name": "Scene 1",
  "asset_type": "VIDEO",
  "file_url": "https://ai-production-asset-managemer.s3.timeweb.com/uploads/xyz789uvw012.mp4",
  "thumbnail_url": "",
  "is_favorite": false,
  "prompt_text": "Generated video",
  "ai_model": null,
  "ai_model_name": null,
  "generation_config": {},
  "seed": null,
  "created_at": "2026-02-08T01:05:00Z",
  "updated_at": "2026-02-08T01:05:00Z"
}
```

#### 3. Загрузка с AI моделью

```bash
curl -X POST http://localhost:8000/api/boxes/1/upload/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -F "file=@generated.jpg" \
  -F "prompt_text=Mountain landscape" \
  -F "ai_model=2" \
  -F "is_favorite=true"
```

### JavaScript примеры

#### React + Fetch

```javascript
const uploadFile = async (boxId, file, options = {}) => {
  const formData = new FormData();
  formData.append('file', file);
  
  if (options.promptText) {
    formData.append('prompt_text', options.promptText);
  }
  
  if (options.isFavorite) {
    formData.append('is_favorite', options.isFavorite);
  }
  
  if (options.aiModelId) {
    formData.append('ai_model', options.aiModelId);
  }
  
  const response = await fetch(`/api/boxes/${boxId}/upload/`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${localStorage.getItem('token')}`
    },
    body: formData
  });
  
  if (!response.ok) {
    throw new Error('Upload failed');
  }
  
  return await response.json();
};

// Использование
const handleFileUpload = async (event) => {
  const file = event.target.files[0];
  
  try {
    const asset = await uploadFile(1, file, {
      promptText: 'My image',
      isFavorite: true
    });
    
    console.log('Upload successful:', asset);
  } catch (error) {
    console.error('Upload failed:', error);
  }
};
```

#### React компонент с drag-and-drop

```javascript
import React, { useState } from 'react';

const FileUploader = ({ boxId, onUploadSuccess }) => {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleUpload = async (file) => {
    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('prompt_text', '');
      
      const response = await fetch(`/api/boxes/${boxId}/upload/`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${localStorage.getItem('token')}`
        },
        body: formData
      });
      
      const asset = await response.json();
      onUploadSuccess(asset);
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleUpload(file);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleUpload(file);
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      style={{
        border: dragOver ? '2px dashed blue' : '2px dashed gray',
        padding: '40px',
        textAlign: 'center'
      }}
    >
      {uploading ? (
        <p>Uploading...</p>
      ) : (
        <>
          <p>Drag and drop file here or</p>
          <input
            type="file"
            onChange={handleFileChange}
            accept="image/*,video/*"
          />
        </>
      )}
    </div>
  );
};
```

#### Axios пример

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000/api',
  headers: {
    'Authorization': `Token ${localStorage.getItem('token')}`
  }
});

const uploadFile = async (boxId, file, promptText = '', isFavorite = false) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('prompt_text', promptText);
  formData.append('is_favorite', isFavorite);
  
  const { data } = await api.post(`/boxes/${boxId}/upload/`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  
  return data;
};
```

### Обработка ошибок

#### 400 Bad Request - Файл не предоставлен
```json
{
  "error": "File is required"
}
```

#### 404 Not Found - Бокс не найден или нет прав
```json
{
  "detail": "Not found."
}
```

#### 500 Internal Server Error - Ошибка загрузки
```json
{
  "error": "Failed to upload file: [error message]"
}
```

### S3 Configuration

Конфигурация S3 в `settings.py`:

```python
# AWS S3 Configuration
AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
AWS_STORAGE_BUCKET_NAME = os.getenv('AWS_STORAGE_BUCKET_NAME')
AWS_S3_REGION_NAME = os.getenv('AWS_S3_REGION_NAME', 'ru-1')
AWS_S3_ENDPOINT_URL = os.getenv('AWS_S3_ENDPOINT_URL', 'https://s3.timeweb.com')
AWS_S3_CUSTOM_DOMAIN = f'{AWS_STORAGE_BUCKET_NAME}.{AWS_S3_ENDPOINT_URL.replace("https://", "")}'
AWS_S3_OBJECT_PARAMETERS = {
    'CacheControl': 'max-age=86400',
}
AWS_DEFAULT_ACL = 'public-read'
AWS_QUERYSTRING_AUTH = False
AWS_S3_FILE_OVERWRITE = False

DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
MEDIA_URL = f'https://{AWS_S3_CUSTOM_DOMAIN}/media/'
```

### Утилиты (s3_utils.py)

#### upload_file_to_s3()
Загружает файл на S3 с уникальным именем.

```python
from apps.boxes.s3_utils import upload_file_to_s3

file_url, filename = upload_file_to_s3(file, folder='uploads')
# Returns: ('https://bucket.s3.timeweb.com/uploads/abc123.jpg', 'abc123.jpg')
```

#### detect_asset_type()
Определяет тип ассета по расширению.

```python
from apps.boxes.s3_utils import detect_asset_type

asset_type = detect_asset_type('image.jpg')  # Returns: 'IMAGE'
asset_type = detect_asset_type('video.mp4')  # Returns: 'VIDEO'
```

#### delete_file_from_s3()
Удаляет файл из S3 по URL.

```python
from apps.boxes.s3_utils import delete_file_from_s3

success = delete_file_from_s3('https://bucket.s3.timeweb.com/uploads/abc123.jpg')
# Returns: True/False
```

### Особенности реализации

#### 1. Уникальные имена файлов
Каждый файл получает уникальное имя (UUID) с сохранением расширения:
```
original: sunset.jpg
uploaded: a1b2c3d4e5f6789.jpg
```

#### 2. Автоопределение типа
Тип ассета определяется автоматически по расширению файла.

#### 3. Публичный доступ
Файлы загружаются с `public-read` ACL, что делает их доступными по прямой ссылке.

#### 4. Без перезаписи
`AWS_S3_FILE_OVERWRITE = False` - файлы с одинаковым именем не перезаписываются.

#### 5. Кеширование
`CacheControl: max-age=86400` - файлы кешируются на 24 часа.

### Тестирование

API endpoint покрыт тестами:
- ✅ Загрузка изображения
- ✅ Загрузка видео
- ✅ Ошибка при отсутствии файла
- ✅ Ошибка при попытке загрузки в чужой бокс

```bash
docker compose exec backend python manage.py test apps.boxes.test_api
# Found 17 test(s).
# Ran 17 tests in 3.598s
# OK
```

### Безопасность

1. **Аутентификация**: Требуется токен авторизации
2. **Permissions**: Проверка владения боксом через `IsProjectOwner`
3. **Уникальные имена**: Предотвращение конфликтов имен файлов
4. **Валидация**: Проверка наличия файла и валидация через serializer

### Следующие шаги

Можно добавить:
1. **Thumbnail генерация** - автоматическое создание превью для изображений
2. **Валидация размера** - ограничение размера файла
3. **Валидация типа** - проверка MIME-типа
4. **Progress tracking** - отслеживание прогресса загрузки
5. **Batch upload** - загрузка нескольких файлов за раз
6. **Image optimization** - сжатие изображений перед загрузкой

### Примеры интеграции

#### Загрузка результата AI генерации

```python
# После генерации через AI
import requests
from django.core.files.base import ContentFile

# Скачать сгенерированное изображение
response = requests.get(ai_result_url)
file_content = ContentFile(response.content, name='generated.jpg')

# Загрузить на S3 через endpoint
# (в реальности лучше использовать s3_utils напрямую)
```

#### Загрузка с frontend + preview

```javascript
const FileUploadWithPreview = ({ boxId }) => {
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    
    // Preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result);
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`/api/boxes/${boxId}/upload/`, {
      method: 'POST',
      headers: { 'Authorization': `Token ${token}` },
      body: formData
    });
    
    const asset = await response.json();
    console.log('Uploaded:', asset);
  };

  return (
    <div>
      <input type="file" onChange={handleFileSelect} />
      {preview && <img src={preview} alt="Preview" width="200" />}
      <button onClick={handleUpload} disabled={!file}>
        Upload
      </button>
    </div>
  );
};
```

## 🎉 Готово!

Endpoint `/api/boxes/{id}/upload/` полностью функционален и готов к использованию!
