# Sharing Hardening & Filters — Design Spec

> 2026-04-05 | Три блока: багфиксы шеринга, булевые фильтры при создании ссылки, фильтрация уведомлений.

## Цель

1. Устранить баги и дыры в sharing-системе (аудит 2026-04-05)
2. Заменить табы при шеринге на булевые фильтры с пересечением
3. Добавить фильтрацию уведомлений по проекту и категории (дропдаун + страница кабинета)

**Главное ограничение:** не ломать существующий UX и API-контракты. Все изменения обратно совместимы.

---

## Блок A: Багфиксы шеринга

Точечные правки, не меняющие API-контракты и UI.

### A1. parent_id валидация в public_comment_view

**Файл:** `backend/apps/sharing/views.py` — `public_comment_view`

**Проблема:** `parent_id` передаётся в `Comment()` без проверки. Несуществующий parent -> 500 (FK constraint), parent из другого элемента -> `ValidationError` из `full_clean()` не перехватывается DRF.

**Решение:**
- Перед созданием Comment проверить:
  - `parent_id` существует в БД
  - parent принадлежит тому же `element_id` / `scene_id`
  - parent принадлежит shared link (element_id in shared_element_ids)
- При нарушении -> `400 Bad Request` с понятным сообщением
- Обернуть `full_clean()` в `try/except ValidationError` -> тоже 400

### A2. is_system фильтр для сцен-комментариев

**Файл:** `backend/apps/sharing/views.py` — `public_share_view`, строка 84-86

**Проблема:** Element-комментарии фильтруются `is_system=False` (строка 75), а scene-комментарии — нет. Системные комментарии утекают в публичную выдачу.

**Решение:** Добавить `is_system=False` в фильтр:
```python
scene_comments = Comment.objects.filter(
    scene_id__in=scene_ids, parent__isnull=True, is_system=False  # <-- добавить
).prefetch_related('replies').order_by('created_at')
```

### A3. Type coercion для element_id

**Файлы:** `backend/apps/sharing/views.py` — `public_review_action`, `public_reaction_view`

**Проблема:** `element_id` из `request.data` может быть строкой. Сравнение `"5" not in {5}` = True -> элемент "не найден", хотя он есть.

**Решение:** В начале обоих view:
```python
try:
    element_id = int(element_id)
except (TypeError, ValueError):
    return Response({'detail': 'element_id must be an integer'}, status=400)
```

### A4. Рекурсивные запросы дочерних сцен

**Файл:** `backend/apps/sharing/views.py` — `group_element_ids`

**Проблема:** `get_child_ids()` делает рекурсивные SQL-запросы для каждого уровня вложенности.

**Решение:** Один запрос — выбрать все сцены проекта, построить дерево в Python:
```python
all_scenes = Scene.objects.filter(project=scene.project).values_list('id', 'parent_id')
# Построить словарь children, обойти BFS/DFS в памяти
```

### A5. Throttle анонимов

**Файл:** `backend/apps/sharing/views.py` — `PublicCommentThrottle`

**Изменение:** `rate = '600/min'` -> `rate = '60/min'`

### A6. Новый тип notification — reaction_new

**Файл:** `backend/apps/notifications/models.py`

**Изменение:** Добавить в `Notification.Type`:
```python
REACTION_NEW = 'reaction_new', 'Новая реакция'
```

**Файл:** `backend/apps/sharing/views.py` — `public_reaction_view`

**Изменение:** Заменить `Notification.Type.COMMENT_NEW` -> `Notification.Type.REACTION_NEW`

**Миграция:** ALTER добавляет новый choice — обратно совместимо, старые записи не затрагиваются.

### A7. Throttle на GET public_share_view

**Файл:** `backend/apps/sharing/views.py` — `public_share_view`

**Изменение:** Добавить отдельный throttle:
```python
class PublicReadThrottle(AnonRateThrottle):
    rate = '120/min'
```
Применить к `public_share_view` через `@throttle_classes([PublicReadThrottle])`.

### A8. Санитизация author_name

**Файлы:** `backend/apps/sharing/views.py` — `public_review_action`, `public_reaction_view`, `public_comment_view`

**Изменение:** Для `author_name` в каждом endpoint:
```python
author_name = strip_tags(request.data.get('author_name', '')).strip()[:100]
```

---

## Блок B: Булевые фильтры при шеринге

### Бэкенд

**Файлы:** `backend/apps/sharing/views.py` — `project_element_ids`, `group_element_ids`

**Изменение:** Добавить `source_type` в `.values()`:
```python
.values('id', 'element_type', 'is_favorite', 'source_type')
```

Это единственное изменение бэкенда. Обратно совместимо — добавляется поле в ответ.

### Фронт — типы

**Файл:** `frontend/lib/types/index.ts`

Обновить `ShareableElement`:
```typescript
interface ShareableElement {
  id: number
  element_type: string    // 'IMAGE' | 'VIDEO'
  is_favorite: boolean
  source_type: string     // 'GENERATED' | 'UPLOADED'
}
```

Обновить `NotificationType` (нужно и для блока A6, и для блока C):
```typescript
export type NotificationType =
  | 'comment_new'
  | 'reaction_new'
  | 'generation_completed'
  | 'generation_failed'
  | 'upload_completed'
```

### Фронт — CreateLinkDialog

**Файл:** `frontend/components/sharing/CreateLinkDialog.tsx`

**Что убирается:** Текущие табы-фильтры (`FilterType = 'all' | 'images' | 'videos' | 'favorites'`), массив `FILTERS`, `useMemo` с if/else.

**Что появляется:** Группа тогглов-пилюль с тремя осями, визуально разделёнными точкой:

```
[Генерации] [Загрузки]  ·  [Фото] [Видео]  ·  [Избранное]
```

**Состояние фильтров:**
```typescript
const [sourceFilter, setSourceFilter] = useState<Set<'GENERATED' | 'UPLOADED'>>(new Set())
const [typeFilter, setTypeFilter] = useState<Set<'IMAGE' | 'VIDEO'>>(new Set())
const [favoriteFilter, setFavoriteFilter] = useState(false)
```

**Логика пересечения (useMemo):**
```
- Ничего не выбрано -> все элементы
- Внутри оси -> OR (Фото + Видео = оба типа)
- Между осями -> AND (Генерации + Фото = сгенерированные фото)
- Избранное -> AND с остальными осями
```

Псевдокод:
```typescript
const filteredIds = useMemo(() => {
  if (!hasMetadata) return elementIds
  return elements.filter(el => {
    if (sourceFilter.size > 0 && !sourceFilter.has(el.source_type)) return false
    if (typeFilter.size > 0 && !typeFilter.has(el.element_type)) return false
    if (favoriteFilter && !el.is_favorite) return false
    return true
  }).map(el => el.id)
}, [elements, sourceFilter, typeFilter, favoriteFilter, hasMetadata, elementIds])
```

**Каждая пилюля показывает счётчик** — количество элементов, попадающих в текущее пересечение при включении этой пилюли. Рядом с текстом: `Генерации (12)`.

**Общий счётчик** внизу: "X элементов будет доступно" — обновляется мгновенно.

**Визуальный стиль пилюль:**
- Неактивная: ghost/outline стиль (`border border-border text-muted-foreground`)
- Активная: filled стиль (`bg-primary text-primary-foreground`)
- Размер: `text-xs`, `px-3 py-1`, `rounded-full`
- Разделитель осей: символ `·` цвета `text-muted-foreground/50`

**Пилюля с нулевым счётчиком** — disabled, пониженная opacity, не кликается.

### Фронт — WorkspaceContainer

**Файл:** `frontend/components/element/WorkspaceContainer.tsx`

Обновить маппинг элементов при передаче в CreateLinkDialog — добавить `source_type`:
```typescript
.map(e => ({ id: e.id, element_type: e.element_type, is_favorite: e.is_favorite, source_type: e.source_type }))
```

---

## Блок C: Фильтрация уведомлений

### Бэкенд

#### Новый тип notification — upload_completed

**Файл:** `backend/apps/notifications/models.py`

```python
UPLOAD_COMPLETED = 'upload_completed', 'Загрузка завершена'
```

**Файл:** `backend/apps/elements/tasks.py` — `process_upload` (или аналогичный таск)

При успешном завершении загрузки — создать notification:
```python
create_notification(
    user=element.project.user,
    type=Notification.Type.UPLOAD_COMPLETED,
    project=element.project,
    title='Файл загружен',
    message=element.original_filename or 'Загрузка завершена',
    element=element,
)
```

#### Расширение API notification_list

**Файл:** `backend/apps/notifications/views.py` — `notification_list`

Добавить поддержку:
- `?project=<id>` — фильтр по project_id
- `?type=comment_new,reaction_new` — множественные типы через запятую

```python
project_id = request.query_params.get('project')
if project_id:
    qs = qs.filter(project_id=project_id)

types = request.query_params.get('type')
if types:
    type_list = [t.strip() for t in types.split(',')]
    qs = qs.filter(type__in=type_list)
```

Существующий `?type=single_value` продолжит работать — один элемент в списке.

#### Endpoint для списка проектов

Уже есть `GET /api/projects/` — используем его для дропдауна. Новых endpoints не нужно.

### Фронт — API клиент

**Файл:** `frontend/lib/api/notifications.ts`

Обновить сигнатуру `list`:
```typescript
list: (params?: { type?: string; is_read?: boolean; offset?: number; project?: number }) =>
```

Параметр `project` передаётся как `?project=<id>`. Параметр `type` теперь может содержать comma-separated значения (`comment_new,reaction_new`).

### Фронт — стор

**Файл:** `frontend/lib/store/notifications.ts`

Добавить состояние фильтров:
```typescript
interface NotificationFilters {
  projectId: number | null
  types: string[] | null  // null = все типы
}

// В сторе:
filters: NotificationFilters
setFilters: (filters: Partial<NotificationFilters>) => void
```

`fetchNotifications` передаёт фильтры в API:
```typescript
fetchNotifications: async (offset = 0) => {
  const { filters } = get()
  const params: Record<string, string> = { offset: String(offset) }
  if (filters.projectId) params.project = String(filters.projectId)
  if (filters.types) params.type = filters.types.join(',')
  // ... fetch
}
```

При изменении фильтров — сброс offset и перезагрузка.

### Фронт — категории

Маппинг типов в категории (фронт-only, не бэкенд):

```typescript
const CATEGORIES = {
  feedback: {
    label: 'Отзывы',
    types: ['comment_new', 'reaction_new'],
  },
  content: {
    label: 'Контент',
    types: ['generation_completed', 'generation_failed', 'upload_completed'],
  },
}
```

Когда пользователь включает тогл "Отзывы" — в API уходит `?type=comment_new,reaction_new`.
Включает оба — уходят все типы (= не передаём `type` вообще).
Ни один не включен — тоже не передаём `type` (показываем всё).

### Фронт — страница уведомлений

**Файл:** `frontend/app/(cabinet)/cabinet/notifications/page.tsx`

**Что убирается:** Табы "Все / Комментарии / Генерации" и in-memory фильтрация по типу.

**Что появляется:** Шапка с двумя контролами:

```
[Все проекты v]   [Отзывы] [Контент]
```

- **Дропдаун проекта:** Select с `Все проекты` по умолчанию + список проектов пользователя (из API /api/projects/). Компактный, текст + иконка.
- **Тогглы категорий:** Те же пилюли что в шеринге. Аддитивная логика: ничего = всё, включил один = только он.

При смене фильтра — `setFilters()` в сторе -> автоматическая перезагрузка с offset=0.

### Фронт — NotificationIcon (общий компонент)

Сейчас `NotificationIcon` дублируется в двух файлах:
- `frontend/app/(cabinet)/cabinet/notifications/page.tsx`
- `frontend/components/layout/NotificationDropdown.tsx`

**Решение:** Вынести в общий компонент `frontend/components/ui/notification-icon.tsx` и импортировать в обоих местах. Новые иконки:
- `reaction_new` -> ThumbsUp, синий
- `upload_completed` -> Upload, зелёный

### Фронт — дропдаун уведомлений (колокольчик)

**Файл:** `frontend/components/layout/NotificationDropdown.tsx`

**Что убирается:** Табы "Все / Комментарии / Генерации".

**Что появляется:** Те же два контрола, но компактнее:
- Дропдаун проекта — мини-select, `text-xs`
- Тогглы — маленькие пилюли, `text-xs`

Фильтры **синхронизированы** между дропдауном и страницей через общий стор.

**Поведение при открытии дропдауна:** Если фильтры в сторе изменились с момента последнего fetch — дропдаун при открытии делает `fetchNotifications(0)` с актуальными фильтрами (вместо текущей логики "fetch только если список пуст"). Реализация: стор хранит `lastFetchedFilters` и сравнивает с текущими `filters` при открытии попапа. Если не совпадают — перезагрузка.

---

## Что НЕ меняется

- Публичная страница шеринга (`/share/[token]`) — без изменений
- ReviewerLightbox, CommentThread, ReviewerNameInput — без изменений
- SharedLinkViewSet (CRUD ссылок) — без изменений
- WebSocket-механизм уведомлений — без изменений
- Модели Comment, ElementReaction, ElementReview — без изменений (только новые типы Notification)
- ShareLinksPanel — без изменений
- Навигация по клику на уведомление — без изменений

## Порядок реализации

```
A (багфиксы) -> B (фильтры шеринга) -> C (фильтры уведомлений)
```

A не зависит от B и C. B и C независимы друг от друга, но A должен быть первым (A6 создаёт тип `reaction_new`, который нужен в C).

## Миграции

1. `Notification.Type` — добавить `reaction_new` и `upload_completed` (одна миграция)
2. Обратно совместимо: новые choices, старые записи не затрагиваются

## Файлы, затрагиваемые изменениями

### Бэкенд
- `backend/apps/sharing/views.py` — блоки A1-A8, B
- `backend/apps/notifications/models.py` — A6, C (новые типы)
- `backend/apps/notifications/views.py` — C (фильтры в API)
- `backend/apps/elements/tasks.py` — C (upload_completed notification)
- Одна миграция для notifications

### Фронт
- `frontend/lib/types/index.ts` — B (ShareableElement), A6+C (NotificationType)
- `frontend/lib/api/notifications.ts` — C (project param)
- `frontend/lib/api/sharing.ts` — без изменений (API уже возвращает нужные поля)
- `frontend/lib/store/notifications.ts` — C (фильтры в сторе)
- `frontend/components/sharing/CreateLinkDialog.tsx` — B (тогглы)
- `frontend/components/element/WorkspaceContainer.tsx` — B (source_type в маппинге)
- `frontend/components/ui/notification-icon.tsx` — C (новый общий компонент)
- `frontend/app/(cabinet)/cabinet/notifications/page.tsx` — C (фильтры, убрать табы)
- `frontend/components/layout/NotificationDropdown.tsx` — C (фильтры, убрать табы)

## Риски

- **Блок B:** Если у пользователя нет загруженных элементов — тогл "Загрузки" будет disabled. Это ожидаемо.
- **Блок C:** Дропдаун проекта загружает список проектов. Если проектов много (100+) — нужен search/autocomplete. Пока делаем простой select, если пользователи пожалуются — добавим поиск.
- **Блок C:** Синхронизация фильтров между дропдауном и страницей — при навигации между ними стор сохраняет состояние. Сброс при логауте.
