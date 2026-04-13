# Шеринг и отзывы

> Актуальное состояние подсистемы. Обновлять при внесении изменений.
> Последнее обновление: 2026-04-13

## Обзор

Модуль «Шеринг и отзывы» — атомарная подсистема обратной связи между создателем проекта и внешними рецензентами (клиентами).

**Две стороны:**
- **Ревьюер** (клиент) — на публичной странице `/share/{token}` оставляет комментарии к элементам и ко всей ссылке, ставит лайки/дизлайки, согласовывает или отклоняет элементы
- **Создатель** — в workspace видит весь фидбек в overlay «Отзывы» (toggle-кнопка в toolbar), отвечает inline, переходит в lightbox по клику

**Принципы:**
- WebSocket-first — polling только fallback при потере соединения
- Красный цвет НЕ для badge'ей непрочитанных — используется `emerald-500`
- Все user-facing тексты на русском
- Иконки: Lucide. Иконка `Sparkles` запрещена на уровне проекта

---

## Модели

Файл: `backend/apps/sharing/models.py`

### SharedLink

Публичная ссылка на набор элементов проекта.

| Поле | Тип | Описание |
|------|-----|----------|
| `project` | FK(Project, CASCADE) | Проект, related_name='shared_links' |
| `created_by` | FK(User, CASCADE) | Создатель ссылки |
| `name` | CharField(100, blank) | Название ссылки (опциональное) |
| `elements` | M2M(Element, blank) | Элементы, включённые в ссылку |
| `display_preferences` | JSONField(default=dict) | Настройки отображения (size, aspectRatio, fitMode) |
| `token` | UUIDField(unique, default=uuid4) | Публичный токен доступа |
| `expires_at` | DateTimeField(null) | Срок действия (null = бессрочная) |
| `created_at` | DateTimeField(auto_now_add) | |
| `updated_at` | DateTimeField(auto_now) | |

**Методы:**
- `is_expired() → bool` — проверяет `expires_at` против `timezone.now()`
- `__str__()` — `'Ссылка на "{project.name}" (бессрочная/до DD.MM.YYYY)'`

**Meta:** `ordering = ['-created_at']`

### Comment

Комментарий к одной из трёх сущностей: element, scene или shared_link. Ровно одна из трёх FK должна быть заполнена (constraint на уровне БД).

| Поле | Тип | Описание |
|------|-----|----------|
| `scene` | FK(Scene, null, CASCADE) | Target: сцена |
| `element` | FK(Element, null, CASCADE) | Target: элемент |
| `shared_link` | FK(SharedLink, null, CASCADE) | Target: ссылка (для общих комментариев) |
| `parent` | FK(self, null, CASCADE) | Родительский комментарий (для replies, 1 уровень) |
| `author_name` | CharField(100) | Имя автора (guest или username) |
| `author_user` | FK(User, null, SET_NULL) | Авторизованный автор (null для гостей) |
| `session_id` | CharField(36, blank, default='') | ID сессии гостя (UUID) или `user_{id}` для авторизованных |
| `text` | TextField(max_length=2000) | Текст. HTML stripped на backend через `strip_tags()` |
| `is_read` | BooleanField(default=False) | Прочитано создателем |
| `is_system` | BooleanField(default=False) | Системный комментарий (фильтруется из выдачи) |
| `created_at` | DateTimeField(auto_now_add) | |
| `updated_at` | DateTimeField(auto_now) | |

**Constraint:**
```python
CheckConstraint(
    check=(
        Q(scene__isnull=False, element__isnull=True, shared_link__isnull=True) |
        Q(scene__isnull=True, element__isnull=False, shared_link__isnull=True) |
        Q(scene__isnull=True, element__isnull=True, shared_link__isnull=False)
    ),
    name='comment_single_target'
)
```

**Validation (`clean()`):** Reply должен быть к тому же target что и parent.

**Meta:** `ordering = ['created_at']`

### ElementReaction

Лайк/дизлайк на элемент. Один голос на сессию.

| Поле | Тип | Описание |
|------|-----|----------|
| `element` | FK(Element, CASCADE) | |
| `session_id` | CharField(36) | |
| `author_name` | CharField(100, default='') | |
| `value` | CharField(choices: 'like'/'dislike') | |
| `created_at` | DateTimeField(auto_now_add) | |

**Meta:** `unique_together = ['element', 'session_id']`

### ElementReview

Согласование элемента. Один голос на сессию. Toggle: повторный клик на тот же action → удаляет review.

| Поле | Тип | Описание |
|------|-----|----------|
| `element` | FK(Element, CASCADE) | |
| `session_id` | CharField(36) | |
| `author_name` | CharField(100, default='') | |
| `action` | CharField(choices: 'approved'/'changes_requested'/'rejected') | |
| `created_at` | DateTimeField(auto_now_add) | |
| `updated_at` | DateTimeField(auto_now) | |

**Meta:** `unique_together = ['element', 'session_id']`

---

## API endpoints

Файлы: `backend/apps/sharing/views.py`, `backend/apps/sharing/urls.py`

### Публичные (AllowAny, rate limited)

| Method | URL | View | Throttle | Описание |
|--------|-----|------|----------|----------|
| GET | `/api/sharing/public/{token}/` | `public_share_view` | 120/min | Загрузить раскадровку: элементы, комментарии, reactions, reviews, general_comments. Группировка по сценам. Проверка `is_expired()` → 410 |
| POST | `/api/sharing/public/{token}/comments/` | `public_comment_view` | 60/min | Создать комментарий. `element_id` → к элементу, `scene_id` → к сцене, ни то ни другое → general comment к ссылке. HTML stripped. Broadcast WS + notification |
| POST | `/api/sharing/public/{token}/reactions/` | `public_reaction_view` | 60/min | Лайк/дизлайк. `value=null` → удалить. `update_or_create` per session. Notification только при первой реакции. Broadcast WS |
| POST | `/api/sharing/public/{token}/review/` | `public_review_action` | 60/min | Согласование. Toggle: тот же action повторно → удалить. `update_or_create`. Notification + broadcast WS |

**Особенности `public_share_view`:**
- Annotation `comment_count` фильтрует `is_system=False`
- Prefetch: reactions, reviews, comments (bulk, без N+1)
- Response включает `general_comments` — комментарии к самой ссылке
- Группировка: `scenes[]` (со `scenes[].elements[]` и `scenes[].comments[]`) + `ungrouped_elements[]`

### Приватные (IsAuthenticated)

| Method | URL | View | Описание |
|--------|-----|------|----------|
| GET/POST/PATCH/DELETE | `/api/sharing/links/` | `SharedLinkViewSet` | CRUD ссылок. Create требует `feature_required('sharing')` (subscription gating). Фильтр по `?project=` |
| GET/POST | `/api/sharing/elements/{id}/comments/` | `element_comments_view` | Комментарии к элементу (owner only) |
| GET/POST | `/api/sharing/scenes/{id}/comments/` | `scene_comments_view` | Комментарии к сцене (owner only) |
| GET/POST | `/api/sharing/links/{id}/comments/` | `link_comments_view` | Общие комментарии к ссылке (owner only). Для ответов создателя |
| GET | `/api/sharing/elements/{id}/reactions/` | `element_reactions_view` | Реакции на элемент |
| GET | `/api/sharing/elements/{id}/reviews/` | `element_reviews_view` | Ревью элемента |
| GET | `/api/sharing/project-feedback/{id}/` | `project_feedback_view` | **Агрегированный фидбек** по всем ссылкам проекта. Для overlay «Отзывы» |
| PATCH | `/api/sharing/comments/{id}/read/` | `mark_comment_read` | Пометить прочитанным (element, scene или shared_link comments) |
| POST | `/api/sharing/comments/read-all/` | `mark_all_comments_read` | Все комментарии проекта — прочитаны (element + scene + shared_link) |
| GET | `/api/sharing/project-elements/{id}/` | `project_element_ids` | Метаданные элементов проекта (для фильтров при создании ссылки) |
| GET | `/api/sharing/group-elements/{id}/` | `group_element_ids` | Метаданные элементов сцены + вложенных (BFS) |

### project-feedback response format

```json
{
  "links": [
    {
      "id": 1,
      "name": "Для клиента v2",
      "token": "uuid-string",
      "unread_count": 3,
      "stats": {
        "approved": 3,
        "changes_requested": 1,
        "rejected": 0,
        "total_elements": 5
      },
      "elements": [
        {
          "id": 42,
          "original_filename": "shot-01.jpg",
          "thumbnail_url": "https://...",
          "element_type": "IMAGE",
          "review_summary": { "action": "approved", "author_name": "Дмитрий" },
          "reviews": [{ "session_id": "...", "author_name": "...", "action": "approved" }],
          "likes": 2,
          "dislikes": 0,
          "comments": [{ "id": 1, "author_name": "Анна", "text": "...", "replies": [...] }]
        }
      ],
      "general_comments": [
        { "id": 5, "author_name": "Анна", "text": "В целом нравится", "replies": [...] }
      ]
    }
  ]
}
```

### Review summary — worst-wins агрегация

Используется в `ElementSerializer.get_review_summary()` и в `project_feedback_view`:

```python
priority = {'rejected': 0, 'changes_requested': 1, 'approved': 2}
worst = min(reviews, key=lambda r: priority.get(r.action, 99))
return {'action': worst.action, 'author_name': worst.author_name}
```

Если хотя бы один rejected → summary = rejected. Если хотя бы один changes_requested → summary = changes_requested. Иначе approved.

---

## Serializers

Файл: `backend/apps/sharing/serializers.py`

| Serializer | Назначение |
|------------|-----------|
| `CommentSerializer` | Полный комментарий с replies (рекурсивный). Fields: id, scene, element, parent, author_name, author_user, session_id, text, is_read, is_system, created_at, replies |
| `CreateCommentPublicSerializer` | Валидация публичного комментария: text, author_name, session_id, element_id?, scene_id?, parent_id?. Нельзя указать и element_id и scene_id одновременно |
| `CreateCommentAuthSerializer` | Валидация комментария от авторизованного: text, parent_id? |
| `SharedLinkSerializer` | CRUD ссылки: element_ids (write-only), element_count, comment_count, url, project_name |
| `PublicElementSerializer` | Элемент для публичной выдачи |
| `PublicSceneSerializer` | Сцена для публичной выдачи |
| `PublicProjectSerializer` | Проект для публичной выдачи |

---

## Permissions

Файл: `backend/apps/sharing/permissions.py`

```python
class IsProjectOwner(BasePermission):
    """Проверяет что пользователь — владелец проекта ссылки."""
    def has_object_permission(self, request, view, obj):
        return obj.project.user == request.user
```

Используется в `SharedLinkViewSet`.

---

## WebSocket

### PublicShareConsumer (для ревьюеров)

Файл: `backend/apps/sharing/consumers.py`
URL: `ws/sharing/{token}/` (файл: `backend/apps/sharing/routing.py`)
ASGI: подключён в `backend/config/asgi.py`

**Анонимный** consumer. Аутентификация не требуется — UUID4 token (122 бита энтропии) является секретом.

**Группа:** `share_{token}`

**Connect:** проверяет `SharedLink.objects.get(token=token)` + `not is_expired()`. Если невалидный/expired — `close()`.

**Events (server → client):**

| Event | Когда | Payload |
|-------|-------|---------|
| `new_comment` | Кто-то оставил комментарий | `{type, comment_id, element_id?, scene_id?, shared_link_id?, author_name, text, created_at, session_id}` |
| `reaction_updated` | Кто-то поставил/убрал реакцию | `{type, element_id, likes, dislikes, session_id, value}` |
| `review_updated` | Кто-то согласовал/отклонил | `{type, element_id, session_id, author_name, action}` |

**Broadcast из views:** Функция `_broadcast_to_share_groups(element_id, event_type, data)` в `views.py` находит все SharedLink, содержащие элемент, и шлёт в каждую группу `share_{token}`.

**Ping/pong:** Client шлёт `{type: 'ping'}` → server отвечает `{type: 'pong'}`.

### ProjectConsumer (для создателя) — расширение

Файл: `backend/apps/projects/consumers.py`

Существующий consumer для workspace. Расширен 3 обработчиками для фидбека:

| Handler | Источник | Что делает |
|---------|----------|-----------|
| `new_comment` | `notify_new_comment()` | Forwards `event['comment']` dict |
| `reaction_updated` | `notify_reaction_updated()` | Forwards `event['data']` |
| `review_updated` | `notify_review_updated()` | Forwards `event['data']` |

### Notification services

Файл: `backend/apps/notifications/services.py`

| Функция | Что делает |
|---------|-----------|
| `notify_new_comment(comment, project)` | Создаёт Notification(COMMENT_NEW) + broadcast `new_comment` в `project_{id}` group. Пропускает если автор = owner |
| `notify_reaction_updated(element, likes, dislikes)` | Broadcast `reaction_updated` в `project_{id}` group |
| `notify_review_updated(element, action, author_name)` | Broadcast `review_updated` в `project_{id}` group |

---

## Frontend — сторона ревьюера

### Публичная страница `/share/[token]`

Файл: `frontend/app/share/[token]/page.tsx`

**State:**
- `project` — данные раскадровки (elements, scenes, general_comments)
- `commentsMap: Record<number, Comment[]>` — комментарии по element_id
- `generalComments: Comment[]` — общие комментарии к ссылке
- `reactionsMap: Record<number, string | null>` — мои реакции
- `reviewMap: Record<number, string | null>` — мои ревью
- `reviewerName`, `sessionId` — идентификация ревьюера

**WebSocket:**
- Подключается к `ws/sharing/{token}/` при загрузке (если project loaded)
- Reconnect: exponential backoff, max 5 попыток
- Ping каждые 30 сек
- Dependencies: `[projectLoaded, token, sessionId]` (НЕ `project` object — иначе reconnect storm)
- Обработчики: `new_comment` → в commentsMap или generalComments, `reaction_updated` → в project state + reactionsMap, `review_updated` → в project.reviews[] + reviewMap

**Session ID:** Для авторизованных — `user_{id}` (prefix для избежания коллизий с guest UUID).

**Полоска 3px:** На ElementCard — `getReviewStatus(reviews)` → worst-wins → `bg-emerald-500` / `bg-orange-500` / `bg-red-500/70`.

**Drawer «Обсуждение»:** Кнопка `MessageSquare` в header → Sheet справа 380px → CommentThread для `generalComments`. Badge `emerald-500`.

### Компоненты sharing

Файл: `frontend/components/sharing/`

| Компонент | Назначение |
|-----------|-----------|
| `ReviewerLightbox.tsx` | Полноэкранный просмотр: media, reactions (like/dislike), review buttons (Согласовано/На доработку/Отклонить), comments sidebar, filmstrip с цветными borders |
| `CommentThread.tsx` | Тред комментариев: аватары (цвет по session_id), replies (1 уровень, отступ pl-8), input с Ctrl+Enter, name input для гостей |
| `ReviewerNameInput.tsx` | Форма ввода имени: autoFocus, Enter → submit, сохраняет в localStorage |
| `CreateLinkDialog.tsx` | Создание ссылки: фильтры по source/type/status, название, expiry |
| `ShareLinksPanel.tsx` | Список ссылок проекта: copy URL, delete |
| `ShareSelectionMode.tsx` | Bottom bar для выбора элементов при создании ссылки |
| `ReviewsOverlay.tsx` | **Overlay «Отзывы»** для создателя — accordion по ссылкам, элементы с комментариями, inline-ответы |

### Filmstrip borders

В `ReviewerLightbox.tsx`: неактивные thumbnails получают цветной border по review status:
- `border-emerald-500/50` — approved
- `border-orange-500/50` — changes_requested
- `border-red-500/50` — rejected
- `border-transparent` — нет ревью
- Активный: `border-primary`

---

## Frontend — сторона создателя

### Полоска 3px на ElementCard

Файл: `frontend/components/element/ElementCard.tsx`

Внутри thumbnail area, первым ребёнком (absolute positioned):
```tsx
{reviewSummary && (
  <div className={cn(
    "absolute top-0 left-0 right-0 h-[3px] z-30",
    reviewSummary.action === 'approved' && "bg-emerald-500",
    reviewSummary.action === 'changes_requested' && "bg-orange-500",
    reviewSummary.action === 'rejected' && "bg-red-500/70",
  )} />
)}
```

Prop `reviewSummary` приходит из `ElementSerializer.get_review_summary()`.

### Overlay «Отзывы»

Файл: `frontend/components/sharing/ReviewsOverlay.tsx`

**Точка входа:** Toggle-кнопка «Отзывы» в toolbar `WorkspaceContainer.tsx`. Нажал → overlay. Нажал ещё раз → закрыл.

**Layout:** Overlay поверх grid на полную ширину (`absolute inset-0 top-[44px] z-40`).

**Структура:**
- Header: «Отзывы проекта» + badge непрочитанных (`emerald-500`) + кнопка закрытия
- Accordion по ссылкам: каждая ссылка сворачивается/разворачивается
  - Header: chevron + Link icon + название + stats + badge unread
  - Auto-expand: ссылки с непрочитанными разворачиваются автоматически
- Элементы с фидбеком:
  - Thumbnail (кликабельный → lightbox) + имя файла (кликабельное, `text-primary`)
  - Review badge + reaction counts
  - Комментарии с аватарами + replies
  - Input «Ответить...» (Enter → send)
- Общие комментарии к ссылке: иконка `MessageSquare` + label + тред

**API:** `sharingApi.getProjectFeedback(projectId)` при открытии. Ответы: `addElementComment` для element-level, `addLinkComment` для general.

**Навигация:** Клик по thumbnail/имени → закрыть overlay → открыть lightbox.

### WS обработчики в workspace

Файлы: `SceneWorkspace.tsx`, `WorkspaceContainer.tsx`

| Event | Действие |
|-------|---------|
| `new_comment` | `incrementCommentCount(elementId)` + toast «Новый комментарий от {name}» |
| `review_updated` | `updateElement(elementId, { review_summary: ... })` — обновляет полоску |
| `reaction_updated` | No-op (WorkspaceElement не хранит likes/dislikes) |

---

## Разделение с уведомлениями

Файл: `frontend/lib/store/notifications.ts`

**FEEDBACK_TYPES:** `['comment_new', 'reaction_new', 'review_new']`

| Канал | Что показывает | Где |
|-------|---------------|-----|
| **Bell icon** | Контент: generation_completed, generation_failed, upload_completed. Система: feedback_reply, feedback_reward | `NotificationDropdown.tsx`, `Navbar.tsx` — фильтр `!FEEDBACK_TYPES.includes(n.type)` |
| **Overlay «Отзывы»** | Весь фидбек от рецензентов: комментарии, реакции, согласования | `ReviewsOverlay.tsx` — данные из `project-feedback` endpoint |
| **Tab «Отзывы» в /cabinet/notifications** | Архив: comment_new, reaction_new, review_new | Остаётся как архивный просмотр |

**Важно:** `NotificationDropdown` и `Navbar` берут `notifications` array из store напрямую (НЕ через store method) и фильтруют inline. Вызов store method в Zustand selector вызывает infinite loop (каждый вызов создаёт новый массив).

---

## Типы (TypeScript)

Файл: `frontend/lib/types/index.ts`

### Sharing types

```typescript
interface PublicElement {
  id: number; element_type: ElementType; file_url: string; thumbnail_url: string;
  preview_url?: string; comment_count: number; likes?: number; dislikes?: number;
  reactions?: PublicElementReaction[]; reviews?: PublicElementReview[];
  comments?: Comment[]; source_type?: ElementSource; original_filename?: string;
}

interface PublicElementReaction { session_id: string; author_name: string; value: 'like' | 'dislike' }
interface PublicElementReview { session_id: string; author_name: string; action: 'approved' | 'changes_requested' | 'rejected' }

interface Comment {
  id: number; element: number | null; scene: number | null; parent: number | null;
  author_name: string; author_user: number | null; session_id: string;
  text: string; is_read: boolean; created_at: string; replies: Comment[]; is_system?: boolean;
}
```

### WS events (share page)

```typescript
interface WSShareNewCommentEvent { type: 'new_comment'; comment_id: number; element_id: number | null; scene_id: number | null; author_name: string; text: string; created_at: string; session_id: string }
interface WSShareReactionUpdatedEvent { type: 'reaction_updated'; element_id: number; likes: number; dislikes: number; session_id: string; value: 'like' | 'dislike' | null }
interface WSShareReviewUpdatedEvent { type: 'review_updated'; element_id: number; session_id: string; author_name: string; action: string | null }
type WSShareEvent = WSShareNewCommentEvent | WSShareReactionUpdatedEvent | WSShareReviewUpdatedEvent
```

### WS events (workspace)

```typescript
interface WSReactionUpdatedEvent { type: 'reaction_updated'; element_id: number; likes: number; dislikes: number }
interface WSReviewUpdatedEvent { type: 'review_updated'; element_id: number; action: string | null; author_name: string }
type WSEvent = WSElementStatusChangedEvent | WSNewCommentEvent | WSReactionUpdatedEvent | WSReviewUpdatedEvent
```

### Project feedback types

```typescript
interface ProjectFeedbackElement { id: number; original_filename: string; thumbnail_url: string; element_type: ElementType; review_summary: { action: string; author_name: string } | null; reviews: { session_id: string; author_name: string; action: string }[]; likes: number; dislikes: number; comments: Comment[] }
interface ProjectFeedbackLink { id: number; name: string; token: string; unread_count: number; stats: { approved: number; changes_requested: number; rejected: number; total_elements: number }; elements: ProjectFeedbackElement[]; general_comments: Comment[] }
interface ProjectFeedbackResponse { links: ProjectFeedbackLink[] }
```

---

## API клиент

Файл: `frontend/lib/api/sharing.ts`

| Функция | Endpoint | Auth |
|---------|----------|------|
| `getPublicProject(token)` | GET `/api/sharing/public/{token}/` | No |
| `addPublicComment(token, data)` | POST `/api/sharing/public/{token}/comments/` | No |
| `setReaction(token, data)` | POST `/api/sharing/public/{token}/reactions/` | No |
| `submitReview(token, data)` | POST `/api/sharing/public/{token}/review/` | No |
| `getLinks(projectId?)` | GET `/api/sharing/links/` | Yes |
| `createLink(data)` | POST `/api/sharing/links/` | Yes |
| `updateLink(id, data)` | PATCH `/api/sharing/links/{id}/` | Yes |
| `deleteLink(id)` | DELETE `/api/sharing/links/{id}/` | Yes |
| `getElementComments(elementId)` | GET `/api/sharing/elements/{id}/comments/` | Yes |
| `addElementComment(elementId, data)` | POST `/api/sharing/elements/{id}/comments/` | Yes |
| `getSceneComments(sceneId)` | GET `/api/sharing/scenes/{id}/comments/` | Yes |
| `addSceneComment(sceneId, data)` | POST `/api/sharing/scenes/{id}/comments/` | Yes |
| `addLinkComment(linkId, data)` | POST `/api/sharing/links/{id}/comments/` | Yes |
| `markCommentRead(commentId)` | PATCH `/api/sharing/comments/{id}/read/` | Yes |
| `markAllCommentsRead(projectId)` | POST `/api/sharing/comments/read-all/` | Yes |
| `getProjectFeedback(projectId)` | GET `/api/sharing/project-feedback/{id}/` | Yes |
| `getElementReactions(elementId)` | GET `/api/sharing/elements/{id}/reactions/` | Yes |
| `getElementReviews(elementId)` | GET `/api/sharing/elements/{id}/reviews/` | Yes |
| `getProjectElements(projectId)` | GET `/api/sharing/project-elements/{id}/` | Yes |
| `getGroupElements(sceneId)` | GET `/api/sharing/group-elements/{id}/` | Yes |

Public endpoints используют `publicClient` (axios без auth). Authenticated — `apiClient`.

---

## Безопасность

- **XSS:** `strip_tags()` на `text` и `author_name` в backend views. Frontend не использует `dangerouslySetInnerHTML`
- **Rate limiting:** Public endpoints — AnonRateThrottle (60-120/min). Auth — UserRateThrottle (30/min)
- **Token security:** UUID4 (122 бита энтропии). Подбор нереален. Кто знает token — имеет доступ (как у GET endpoint)
- **Auth:** Приватные endpoints проверяют `project.user == request.user`. WebSocket ProjectConsumer — JWT + ownership check
- **Session collision:** Авторизованные `user_{id}`, гости — UUID. Namespace разделён
- **Expired links:** Все public endpoints проверяют `is_expired()` → 410 Gone
- **Comment validation:** element/scene должен принадлежать ссылке. parent_id валидируется (тот же target)

---

## Тесты

Файл: `backend/apps/sharing/tests/`

**73 теста, все PASS.**

| Класс | Тестов | Что покрывает |
|-------|--------|---------------|
| `SharedLinkModelTest` | 5 | Создание, expiry, str, non-expired, elements |
| `CommentModelTest` | 4 | Single target constraint, clean validation, str |
| `ElementReactionModelTest` | 2 | Create, unique constraint |
| `ElementReviewModelTest` | 2 | Create, unique constraint |
| `PublicShareViewCommentCountTest` | 2 | System comments excluded, zero when only system |
| `ReviewSummaryWorstWinsTest` | 4 | All approved, approved+changes, approved+rejected, no reviews |
| `ExpiredLinkTests` | 4 | GET, comment, reaction, review on expired → 410 |
| `PublicCommentValidationTests` | 6 | Element not in link, parent mismatch, HTML strip, empty text, both targets, nonexistent parent |
| `PublicReactionTests` | 7 | Create, remove, switch, invalid value, counts, session collision, same session update |
| `PublicReviewTests` | 5 | Create, toggle off, switch, notification, invalid action |
| `ThrottleRateTests` | 3 | Public read/comment/auth throttle rates |
| `NotificationTests` | 4 | Comment → notification, reaction first-only, review, owner skip |
| `AuthenticatedCommentTests` | 4 | GET filters system, POST, mark read, mark all read |
| `GeneralCommentsTest` | 8 | Create, public response, reply, notification, creator GET/POST, other user 404, not in element count |
| `ProjectFeedbackTest` | 7 | Auth, access control, links with feedback, general comments, unread, stats, empty project |
| `UngroupedElementTest` | 1 | Ungrouped elements in response |

---

## Миграции

| Миграция | Что делает |
|----------|-----------|
| `0008_comment_session_id_blank` | `session_id` → `blank=True` (для auth комментариев) |
| `0009_add_shared_link_to_comment` | FK `shared_link` + обновление constraint `comment_single_target` |

---

## Известные ограничения

1. **N+1 в project_feedback_view** — цикл по ссылкам делает отдельные запросы. При 10+ ссылках может быть медленно. Оптимизировать если станет проблемой
2. **reaction_updated в workspace — no-op** — WorkspaceElement не хранит likes/dislikes. Реакции видны только в DetailPanel (lightbox) и ReviewsOverlay
3. **Нет fallback polling на share page** — после MAX_RECONNECT=5 данные не обновляются. Добавить visibility-aware polling если нужно
4. **ReviewsOverlay не обновляется по WS** — делает fetch при открытии, но не слушает WS events. При открытом overlay новые комментарии не появятся до переоткрытия

---

## Карта файлов

```
backend/apps/sharing/
├── models.py          → SharedLink, Comment, ElementReaction, ElementReview
├── views.py           → 15 views (public + private + project-feedback)
├── urls.py            → URL routing
├── serializers.py     → 7 serializers
├── consumers.py       → PublicShareConsumer (WebSocket)
├── routing.py         → WS URL: ws/sharing/{token}/
├── permissions.py     → IsProjectOwner
├── services.py        → create_shared_link (legacy)
├── admin.py
├── migrations/
│   ├── 0008_comment_session_id_blank.py
│   └── 0009_add_shared_link_to_comment.py
└── tests/
    ├── __init__.py
    ├── test_models.py → 13 тестов
    └── test_views.py  → 60 тестов

backend/apps/notifications/
└── services.py        → notify_new_comment, notify_reaction_updated, notify_review_updated

backend/apps/projects/
└── consumers.py       → ProjectConsumer (extended: reaction_updated, review_updated)

backend/config/
└── asgi.py            → sharing_ws routing подключён

frontend/components/sharing/
├── ReviewsOverlay.tsx       → Overlay «Отзывы» (accordion, inline-ответы)
├── ReviewerLightbox.tsx     → Lightbox для ревьюера
├── CommentThread.tsx        → Тред комментариев
├── ReviewerNameInput.tsx    → Ввод имени
├── CreateLinkDialog.tsx     → Создание ссылки
├── ShareLinksPanel.tsx      → Список ссылок
└── ShareSelectionMode.tsx   → Выбор элементов

frontend/app/share/[token]/
└── page.tsx                 → Публичная страница (WS, drawer, полоска)

frontend/components/element/
├── ElementCard.tsx          → Полоска 3px review status
├── WorkspaceContainer.tsx   → WS handlers + ReviewsOverlay toggle
└── SceneWorkspace.tsx       → WS handlers

frontend/components/layout/
├── NotificationDropdown.tsx → Bell dropdown (feedback excluded)
└── Navbar.tsx               → Bell badge (feedback excluded)

frontend/lib/
├── api/sharing.ts           → 20 API функций
├── store/notifications.ts   → FEEDBACK_TYPES, getBellNotifications
└── types/index.ts           → Все sharing/WS типы
```
