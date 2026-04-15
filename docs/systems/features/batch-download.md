# Batch Download

> Массовое скачивание элементов проекта в ZIP-архив.
> Последнее обновление: 2026-04-15

## Статус: Реализовано

## Обзор

Пользователь выбирает контекст (проект, группу, произвольный набор элементов), применяет фильтры и скачивает ZIP-архив. Архив собирается в браузере через JSZip — сервер не нагружается. При CORS-ошибках файлы качаются через backend proxy.

## Feature gating

Фича `batch_download` — доступна с тарифа **Создатель Pro**.

- Backend: `feature_required('batch_download')` на endpoint `/api/elements/download-meta/`
- Frontend: `useFeatureGate('batch_download')` в 3-dot меню, кнопка в BulkBar
- Feature, Plan, TierBadge mapping — всё в БД, привязано к `creator_pro`, `team`, `enterprise`

## Точки входа

| Контекст | Компонент | Действие |
|----------|-----------|----------|
| Проект | `ProjectCard` → 3-dot menu → "Скачать" | Все элементы проекта |
| Группа | `GroupCard` → 3-dot menu → "Скачать" | Элементы группы + подгрупп |
| Выделение | `ElementBulkBar` → кнопка "Скачать" | Выбранные элементы и группы |

## Модалка

- Компонент: `frontend/components/download/BatchDownloadDialog.tsx`
- Фильтры: источник (генерации/загрузки), тип (фото/видео), избранное
- Переиспользует `FilterPill` из `frontend/components/ui/filter-pill.tsx`
- Показывает количество и оценку размера: "12 элементов · ~84 МБ"
- Предупреждение при > 500 МБ
- Блокировка при > 200 файлов или > 1 ГБ

## Прогресс

После нажатия "Скачать ZIP" модалка переходит в режим прогресса:

- Progress bar с процентом
- Человеческие сообщения: "Собираем файлы..." → "Добавляем в архив..." → "Осталось совсем немного..." → "Почти готово, формируем архив..." → "Готово, архив сохранён"
- Кнопка "Отмена" на этапах скачивания и сборки
- `beforeunload` предупреждает при попытке уйти

## ZIP-архив

- Библиотека: `jszip` (клиентская, dynamic import)
- Сжатие: DEFLATE level 1 (минимальное — файлы уже сжаты)
- Параллельное скачивание: 4 потока
- Структура: папки по группам (с вложенностью), без группы — в корне
- Дедупликация имён: `photo.png`, `photo (2).png`
- Расширения: `ensureExtension()` — берёт из URL или `element_type`
- Resilient mode: битые файлы пропускаются (лог в console.warn)

```
Проект.zip
├── Группа 1/
│   ├── кадр-001.png
│   └── кадр-002.mp4
├── Группа 2/
│   └── кадр-003.png
└── кадр-004.png
```

## Скачивание файлов

Двухуровневая стратегия:
1. Прямой fetch с S3 (`cache: 'no-store'` — обход кеша от `<img>`)
2. При CORS/HTTP ошибке — fallback через backend proxy `/api/elements/{id}/download/`

## Очистка памяти

- `AbortController` для отмены fetch-ей
- `URL.revokeObjectURL()` через 1 сек после скачивания
- `useEffect` cleanup при unmount компонента

## API

### `GET /api/elements/download-meta/`

Query params: `project_id` или `scene_id` (одно обязательно).

Permissions: `IsAuthenticated`, `feature_required('batch_download')`

Response:
```json
{
  "elements": [
    {
      "id": 1,
      "element_type": "IMAGE",
      "is_favorite": false,
      "source_type": "GENERATED",
      "file_url": "https://...",
      "original_filename": "photo.png",
      "file_size": 1024,
      "scene_id": 5
    }
  ],
  "groups": [
    { "id": 5, "name": "Группа 1", "parent_id": null }
  ]
}
```

- Только `status='COMPLETED'` элементы
- Для `scene_id`: BFS по дереву сцен (включает подгруппы)
- Для `project_id`: также возвращает все группы проекта

## Файлы

```
frontend/
├── components/
│   ├── download/
│   │   ├── BatchDownloadDialog.tsx    — модалка + фильтры + прогресс
│   │   └── use-batch-download.ts     — хук: state machine, abort, beforeunload
│   └── ui/
│       ├── filter-pill.tsx            — shared FilterPill + toggleInSet
│       └── progress.tsx               — shadcn Progress bar
├── lib/
│   ├── api/elements.ts               — getDownloadMeta()
│   ├── types/index.ts                — DownloadableElement, DownloadMetaResponse
│   └── utils/zip.ts                  — buildAndDownloadZip, sanitize, dedup, ensureExtension

backend/
├── apps/elements/
│   ├── views.py                      — download_meta view
│   ├── urls.py                       — path('download-meta/', ...)
│   └── tests/test_download_meta.py   — 8 тестов
```

## Ограничения

- Жёсткий лимит: 200 файлов или 1 ГБ — UI блокирует скачивание
- Мобильные браузеры: работает, но RAM ограничен — для мобильной версии стоит снизить лимиты или скрыть
- S3 CORS: настроен на Timeweb, `cache: 'no-store'` обходит конфликт с кешем `<img>`

## Спека

`docs/superpowers/specs/2026-04-14-batch-download-design.md`

## Backlog

- Серверная ZIP-сборка (Celery) для очень больших архивов
- Выбор качества (оригинал / preview / thumbnail)
- Скачивание из Lightbox ("Скачать всё")
- Мобильная адаптация (сниженные лимиты)
