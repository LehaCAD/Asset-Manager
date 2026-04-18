# Storage — S3 и публичные URL

## Бакет

Prod S3: `raskadrawka-clients` на `s3.regru.cloud`. Все пользовательские файлы (оригиналы, превью, системные ассеты моделей) лежат здесь. Настройки Django — `config/settings.py:257-273`, `DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'`.

ACL: `public-read`. Ключи генерируются с UUID-секретом (security model «UUID-as-secret», пока не перешли на presigned GET).

## Структура ключей

```
projects/<project_id>/scenes/<scene_id>/...    — контент, загруженный или сгенерированный пользователем
system/model-previews/<filename>.png           — превью AI-моделей для админки (загружаются через AIModel.preview_image)
```

## Варианты контента (Element)

На каждый `Element` генерируется до трёх вариантов (`apps/storage/thumbnails.py`):
- **original** (`file_url`) — исходный файл
- **small** (`thumbnail_url`) — 256px по длинной стороне
- **medium** (`preview_url`) — 800px по длинной стороне

Для изображений — через Pillow, для видео — через ffmpeg (кадр + ресайз). Все три URL хранятся в модели как полные S3-ссылки.

## Брендированный редирект /elements/<id>/

Наружу в API и во фронт уходят не сырые S3-ссылки, а путь `/elements/<id>/...` на собственном домене. Сам сервер отдаёт HTTP 302 на реальный S3-URL, байты клиент тянет напрямую из S3 — бэкенд файлы не проксирует.

Роуты (`config/urls.py`, view — `apps/elements/views_redirect.py`):

| URL | Вариант | 302-цель |
|-----|---------|----------|
| `/elements/<id>/` | оригинал | `element.file_url` |
| `/elements/<id>/file/` | оригинал (явный) | `element.file_url` |
| `/elements/<id>/thumb/` | 256px | `element.thumbnail_url` |
| `/elements/<id>/preview/` | 800px | `element.preview_url` |

Коды ответа:
- **302** — happy path
- **404** — элемента нет, или variant не из `{file, thumb, preview}`
- **410** — элемент есть, но соответствующий URL-поле пустое (ещё не сгенерирован, или модель не отдаёт превью)
- **405** — метод не `GET`/`HEAD`

### Кто строит эти URL

Хелпер `apps/elements/url_helpers.py`:
- `build_element_url(element, variant, request)` — собирает абсолютный URL через `request.build_absolute_uri()`, отдаёт `''` если исходное поле пустое.
- `build_best_preview_url(element, request)` — каскад `preview → thumb → file`, повторяет ту же логику, что исторически жила в `SceneSerializer`/`ProjectSerializer`.

Этот хелпер вызывается из:
- `apps/elements/serializers.py:ElementSerializer` — `file_url`, `thumbnail_url`, `preview_url`
- `apps/scenes/serializers.py:SceneSerializer` — `headliner_url`, `headliner_thumbnail_url`, `preview_thumbnails`
- `apps/projects/serializers.py:ProjectSerializer` — `preview_thumbnails`
- `apps/sharing/views.py:public_share_view` — элементы публичной шеринг-ленты

### Почему ID, а не slug

Integer `Element.id` и так светится в `/api/elements/<id>/` и в публичных шеринг-лентах — не секрет. Переход на короткие UUID-slug'и — в бэклоге (связан с «S3 security model: public-read + UUID-as-secret»).

### Nginx

В проде `/elements/` уходит на backend отдельным правилом (`nginx/conf.d/default.conf`), потому что всё, что не `/api/|/ws/|/admin/|/static/|/elements/`, проксируется на Next.js. После изменения nginx-конфига — `docker compose -f docker-compose.production.yml restart nginx`.

## Превью AI-моделей (AIModel.preview_image)

Отдельный сценарий: админ загружает превью модели через стандартное Django-поле `ImageField(upload_to='system/model-previews/')`. Файл уходит в S3 через `DEFAULT_FILE_STORAGE`, админ видит миниатюру в форме редактирования. Ребилд фронта больше не нужен. Выдача наружу — через `AIModel.get_preview_url()` → либо S3-URL файла, либо fallback на `preview_url` CharField (внешние ссылки).

## Чего избегать

- Не грузить файлы в S3 синхронно из Django-view: Daphne не справится. Только через staging + Celery.
- Не стримить байты контента через бэкенд: `/elements/<id>/` — это 302, а не прокси. Менять на streaming — значит убить Daphne под нагрузкой.
- Не менять ключи существующих объектов: `AWS_S3_FILE_OVERWRITE = False`, файл по тому же пути просто получит суффикс. Если надо переименовать — загружаем новый, обновляем ссылку в БД, старый удаляем отдельной задачей.
