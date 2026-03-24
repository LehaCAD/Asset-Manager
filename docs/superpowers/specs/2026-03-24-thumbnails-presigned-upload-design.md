# Thumbnail System + Presigned Upload — Design Spec

> Дата: 2026-03-24
> Статус: Approved

## Проблема

1. **Картинки без thumbnail** — `thumbnail_url = file_url`, в гриде грузятся оригиналы по 5-10MB на карточку.
2. **Всё идёт через сервер** — upload: браузер → Django → staging → Celery → S3. VPS с 2 воркерами — бутылочное горлышко.
3. **ffmpeg для видео** — единственная тяжёлая операция, занимает Celery слот на 5-15 сек.

## Решение

Два независимых потока с разной ответственностью:

- **Upload** — браузер делает thumbnail + presigned URL загрузка напрямую в S3. Сервер не трогает файлы.
- **Generation** — сервер делает thumbnail (файл уже в temp после скачивания от провайдера).

## Размеры thumbnail

| Размер | Длинная сторона | Quality | Вес | Использование |
|--------|----------------|---------|-----|---------------|
| **small** | 256px | JPEG q80 | ~5-15KB | Грид, filmstrip, prompt bar inputs, detail panel миниатюры |
| **medium** | 800px | JPEG q85 | ~40-80KB | Lightbox просмотр |
| **original** | Как есть | Как есть | 1-10MB | Кнопка «Смотреть оригинал» / скачивание |

Для **видео thumbnail** (извлечённый кадр ffmpeg):
- small = Pillow resize 256px из кадра
- medium = нативный кадр ffmpeg как есть (~50-200KB)
- original = видеофайл

## Модель Element — изменения

```python
# Новое поле
preview_url = models.URLField(max_length=500, blank=True)

# Новый статус
STATUS_UPLOADING = 'UPLOADING'  # presign выдан, ждём complete

# Для cleanup orphans (опционально)
upload_keys = models.JSONField(null=True, blank=True)
```

Миграция: одна, AddField + новый choice. Без data migration.

## Предварительная валидация (spike)

Перед реализацией — проверить presigned PUT на Timeweb S3:
1. Сгенерировать presigned PUT URL через `boto3.client('s3')`
2. Тест через `curl -X PUT -T file.jpg <presigned_url>`
3. Тест из браузера с CORS (fetch PUT из localhost:3000)

Если Timeweb не поддерживает presigned PUT — fallback на подход B (клиент делает thumb, но шлёт через сервер).

## Поток 1: Upload (клиент → S3 напрямую)

### Шаг 1: Клиентский ресайз

```
IMAGE:
  File → createImageBitmap() → canvas.drawImage() → toBlob('image/jpeg')
  → small (256px, q80) + medium (800px, q85)

VIDEO:
  File → <video>.currentTime=1 → seeked → canvas.drawImage(video) → toBlob()
  → small (256px, q80) + medium (800px, q85)
  Fallback: currentTime=0.1 → currentTime=0 (чтобы избежать чёрного кадра)
```

### Шаг 2: Presign

```
POST /api/scenes/{id}/presign/
Request:  { filename, file_size, element_type }
Response: {
  element_id,
  upload_keys: { original, small, medium },
  presigned_urls: { original, small, medium },
  expires_in: 900
}
```

Бэкенд:
1. Валидация (формат, размер, квота пользователя)
2. Создаёт Element со `status=UPLOADING`, сохраняет `upload_keys`
3. Генерит 3 presigned PUT URL через **отдельный `boto3.client('s3')`** (не `default_storage` — у него `AWS_QUERYSTRING_AUTH=False`)
4. Presigned URL включает `Content-Type` condition (image/jpeg, image/png, video/mp4) для защиты от загрузки произвольных файлов
5. **Ноль файлового IO**

Аналогичный эндпоинт для project-level: `POST /api/projects/{id}/presign/`

**`scene_id` может быть null** (root-level элементы). S3 key: `projects/{project_id}/root/{filename}` если scene=null, иначе `projects/{project_id}/scenes/{scene_id}/{filename}`.

### Шаг 3: Upload — трёхфазный

```
Фаза 1 — мгновенная карточка:
  1. PUT small → S3                          (~10KB, мгновенно)
  2. POST /api/elements/{id}/complete/
     Body: { phase: "thumbnail" }
     → status=UPLOADING, thumbnail_url заполнен
     → WebSocket notify → карточка появляется

Фаза 2 — фоновая загрузка:
  3. PUT medium + PUT original → S3          (параллельно, Promise.all)
  4. POST /api/elements/{id}/complete/
     Body: { phase: "final", file_size: 5242880 }
     → HEAD-запрос к S3 проверяет что original существует и получает реальный размер
     → status=COMPLETED, file_url + preview_url заполнены, file_size = реальный из HEAD
     → WebSocket notify
```

**Результат:** карточка в гриде появляется за ~100ms. Оригинал догружается в фоне.

**Важно:** `file_url` проставляется ТОЛЬКО в phase=final после HEAD-проверки. До этого element имеет только `thumbnail_url`. Если пользователь закроет вкладку между фазами — карточка с thumbnail, но `file_url` пустой, `status=UPLOADING`. Cleanup task подберёт.

### Эндпоинт complete (двухфазный)

```
POST /api/elements/{id}/complete/
```

**phase=thumbnail:**
1. Проверяет `element.status == UPLOADING` и принадлежит юзеру
2. `thumbnail_url` = public URL из `upload_keys.small`
3. WebSocket notify (карточка появляется)

**phase=final:**
1. HEAD-запрос к S3 на `upload_keys.original` — проверяет существование, получает `Content-Length`
2. `file_url` = public URL из `upload_keys.original`
3. `preview_url` = public URL из `upload_keys.medium`
4. `file_size` = реальный размер из HEAD (не доверяем клиенту)
5. Обновляет квоту storage на основе реального размера
6. `status = COMPLETED`
7. WebSocket notify

## Поток 2: Generation (сервер делает thumbnail)

Текущий flow генерации не меняется. Добавляется ресайз в `finalize_generation_success`:

### IMAGE (Pillow)

```
temp file (уже скачан от провайдера)
  → Pillow.open()
  → .resize(256) → save JPEG q80 → upload small → S3 → thumbnail_url
  → .resize(800) → save JPEG q85 → upload medium → S3 → preview_url
  → upload original → S3 → file_url
```

~50-100ms на оба ресайза.

### VIDEO (ffmpeg + Pillow)

```
temp file
  → ffmpeg -vframes 1 → frame.jpg (нативное разрешение, ~100KB)
  → Pillow.open(frame.jpg)
    → .resize(256) → upload → S3 → thumbnail_url
    → frame.jpg как есть → upload → S3 → preview_url  (ресайз не нужен)
  → upload original video → S3 → file_url
```

Один вызов ffmpeg (уже есть), один вызов Pillow resize.

### Изменения в коде

- `finalize_generation_success` → вызывает `generate_thumbnails(temp_path, element_type, project_id, scene_id)`
- Новый модуль `backend/apps/common/thumbnail_utils.py` — ресайз логика (Pillow + ffmpeg), отдельно от S3. Вызывает `s3_utils` для upload.
- `generate_upload_thumbnail` task → обновляется: делает два размера
- WebSocket payload → добавляется `preview_url` (в `notify_element_status` и в consumer)
- Pillow → добавить явно в `requirements.txt` с pinned версией

## Frontend — модуль client-upload

Один утилитный модуль `lib/utils/client-upload.ts`:

```typescript
async function uploadFile(file: File, opts: {
  sceneId?: number;
  projectId: number;
  promptText?: string;
}): Promise<Element>
```

Инкапсулирует: ресайз → presign → upload → complete. Компоненты вызывают одну функцию.

### Интеграция со store

`scene-workspace.ts` — меняется внутренность `processUploadQueue()`:
- Было: FormData → POST /upload/ → ждём Celery → WebSocket
- Стало: Canvas resize → presign → PUT S3 → complete → готово

Optimistic element с blob URL остаётся как есть.

### Отображение в компонентах

```
ElementCard (грид):       element.thumbnail_url   (small)
Filmstrip:                element.thumbnail_url   (small)
Prompt bar inputs:        element.thumbnail_url   (small)
Detail panel миниатюры:   element.thumbnail_url   (small)
Lightbox просмотр:        element.preview_url     (medium)
Кнопка «Оригинал»:       element.file_url        (original, по клику)
```

### Fallback цепочка (обратная совместимость)

```
thumbnail_url → если нет → file_url
preview_url   → если нет → thumbnail_url → file_url
```

Старые элементы работают как раньше. Новые получают оба размера.

### Изменения в TypeScript типах

```typescript
// frontend/lib/types/index.ts
// ElementStatus — добавить 'UPLOADING'
export type ElementStatus = "PENDING" | "PROCESSING" | "UPLOADING" | "COMPLETED" | "FAILED";

// Element interface — добавить preview_url
export interface Element {
  // ... existing fields ...
  preview_url: string;  // новое поле
}

// WSElementStatusChangedEvent — добавить preview_url
```

## Обработка ошибок

### Upload (клиент)

| Ошибка | Решение |
|--------|---------|
| Canvas resize падает | Тост «Файл слишком большой». Не загружаем |
| Presign упал (сеть, 500) | Тост, optimistic element убирается |
| PUT в S3 упал | Тост «Загрузка прервана». Element UPLOADING → cleanup |
| Small ок, original нет (закрыл вкладку) | Карточка с thumbnail но без оригинала |
| Video seek не сработал (кодек) | Fallback: старый flow через FormData → staging → Celery |

### Generation (сервер)

| Ошибка | Решение |
|--------|---------|
| Pillow resize упал | `thumbnail_url = file_url` (fallback на оригинал) |
| ffmpeg не извлёк кадр | `thumbnail_url = ''`, фронтенд покажет placeholder |
| S3 upload thumbnail упал | Element COMPLETED с file_url, thumbnails пустые |

**Принцип: thumbnail — nice-to-have, never blocker.**

## Защита от мусора в S3

1. **Presigned URL TTL = 15 минут** — протухший URL нельзя использовать
2. **`upload_keys` в Element** — сервер знает какие ключи были выданы
3. **Cleanup task (опционально, позже)** — Celery beat раз в сутки, находит UPLOADING старше 30 мин, удаляет файлы из S3, удаляет элемент

## Миграция существующих данных

**Ленивая, без batch-обработки.** Новые элементы получают thumbnail сразу. Старые работают через fallback цепочку.

Опционально потом: Celery task пробегает старые IMAGE-элементы, делает resize, заполняет `thumbnail_url` + `preview_url`. Не блокер.

## Известные долги (не в scope этой задачи)

- **S3 cleanup при удалении Element** — сейчас `element.delete()` не удаляет файлы из S3. С 3 файлами на элемент (вместо 1) orphan rate утроится. Отдельная задача.
- **Backfill старых элементов** — Celery task для ресайза существующих картинок. Не блокер.

## CORS на S3 (Timeweb)

Разовая настройка бакета:
```json
{
  "AllowedOrigins": ["https://raskadrawka.ru", "http://localhost:3000"],
  "AllowedMethods": ["PUT"],
  "AllowedHeaders": ["Content-Type"]
}
```

## Итоговая нагрузка на сервер

### Upload (после)
- Django: 2 лёгких HTTP-запроса (presign + complete). Ноль файлов.
- Celery: не задействован.
- Staging: не нужен.

### Generation (после)
- Celery: как сейчас + ~100ms Pillow resize для картинок. Без дополнительных тасков.
- ffmpeg для видео: как сейчас, один вызов. Pillow resize кадра — копейки.
