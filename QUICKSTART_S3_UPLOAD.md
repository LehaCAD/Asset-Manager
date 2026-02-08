# 🚀 Quick Start - S3 Upload

## Загрузка файла через curl

```bash
# 1. Получить токен авторизации (или создать суперпользователя)
docker compose exec backend python manage.py createsuperuser

# 2. Создать проект
curl -X POST http://localhost:8000/api/projects/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "My First Project"}'
# Response: {"id": 1, "name": "My First Project", ...}

# 3. Создать бокс
curl -X POST http://localhost:8000/api/boxes/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"project": 1, "name": "Scene 1", "order_index": 0}'
# Response: {"id": 1, "name": "Scene 1", ...}

# 4. Загрузить файл на S3
curl -X POST http://localhost:8000/api/boxes/1/upload/ \
  -H "Authorization: Token YOUR_TOKEN" \
  -F "file=@/path/to/your/image.jpg" \
  -F "prompt_text=Test upload" \
  -F "is_favorite=true"
# Response: {"id": 1, "file_url": "https://...", ...}
```

## React Component

```jsx
import React, { useState } from 'react';

function FileUploader({ boxId, token }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('prompt_text', 'Uploaded from React');

    try {
      const response = await fetch(`/api/boxes/${boxId}/upload/`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${token}`
        },
        body: formData
      });

      const data = await response.json();
      setResult(data);
      console.log('Upload successful:', data);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        onChange={handleFileSelect}
        disabled={uploading}
        accept="image/*,video/*"
      />
      {uploading && <p>Uploading...</p>}
      {result && (
        <div>
          <p>✅ File uploaded!</p>
          <img src={result.file_url} alt="Uploaded" width="200" />
        </div>
      )}
    </div>
  );
}

export default FileUploader;
```

## Python + Requests

```python
import requests

# Настройки
API_URL = 'http://localhost:8000/api'
TOKEN = 'your-token-here'

headers = {
    'Authorization': f'Token {TOKEN}'
}

# Загрузка файла
def upload_file(box_id, file_path, prompt_text='', is_favorite=False):
    with open(file_path, 'rb') as f:
        files = {'file': f}
        data = {
            'prompt_text': prompt_text,
            'is_favorite': is_favorite
        }
        
        response = requests.post(
            f'{API_URL}/boxes/{box_id}/upload/',
            headers=headers,
            files=files,
            data=data
        )
        
        return response.json()

# Использование
result = upload_file(
    box_id=1,
    file_path='sunset.jpg',
    prompt_text='Beautiful sunset',
    is_favorite=True
)

print('Uploaded:', result['file_url'])
```

## Проверка статуса S3

```bash
# Проверить, что S3 настроен правильно
docker compose exec backend python manage.py shell

# В Django shell:
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile

# Тестовая загрузка
content = ContentFile(b'test content')
path = default_storage.save('test/test.txt', content)
print('Saved to:', path)

# Получить URL
url = default_storage.url(path)
print('URL:', url)

# Проверить существование
exists = default_storage.exists(path)
print('Exists:', exists)

# Удалить
default_storage.delete(path)
```

## Тестирование endpoint

```bash
# Запустить все тесты
docker compose exec backend python manage.py test

# Только тесты upload
docker compose exec backend python manage.py test apps.boxes.test_api.BoxAPITest.test_upload_file

# Проверка Django
docker compose exec backend python manage.py check
```

## Переменные окружения

Убедитесь, что в `docker-compose.yml` есть:

```yaml
environment:
  - AWS_ACCESS_KEY_ID=9IK65D3WEVBF7OP7GS42
  - AWS_SECRET_ACCESS_KEY=N4r1GOADgA4He7NV2wcRt6bYb02cdsAVxS2IJqhy
  - AWS_STORAGE_BUCKET_NAME=ai-production-asset-managemer
  - AWS_S3_REGION_NAME=ru-1
  - AWS_S3_ENDPOINT_URL=https://s3.timeweb.com
```

## Типичные ошибки

### 1. "File is required"
```bash
# Убедитесь, что передаете файл с ключом 'file'
-F "file=@image.jpg"  # Правильно
-F "image=@image.jpg" # Неправильно
```

### 2. "Not found" при загрузке
```bash
# Убедитесь, что бокс принадлежит вашему пользователю
# Проверьте ID бокса
curl -H "Authorization: Token YOUR_TOKEN" \
  http://localhost:8000/api/boxes/
```

### 3. S3 ошибка "Access Denied"
```bash
# Проверьте переменные окружения
docker compose exec backend env | grep AWS
```

## Полезные ссылки

- **Детальная документация:** `backend/apps/boxes/S3_UPLOAD_DOCS.md`
- **API документация:** `backend/apps/boxes/API_DOCS.md`
- **Тесты:** `backend/apps/boxes/test_api.py`
