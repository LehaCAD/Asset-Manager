# Шеринг и отзывы

> Актуальное состояние подсистемы. Обновлять при внесении изменений.
> Последнее обновление: 2026-04-17

## Обзор

Модуль «Шеринг и отзывы» — подсистема обратной связи между создателем проекта и внешними рецензентами (клиентами).

**Две стороны:**
- **Ревьюер** (клиент) — на публичной странице `/share/{token}` оставляет комментарии к элементам и ко всей ссылке, ставит лайки/дизлайки, согласовывает или отклоняет элементы. Видит полный тред обсуждения через overlay «Обсуждение»
- **Создатель** — из любого места (корень проектов, внутри проекта, в группе) открывает overlay «Ссылки и отзывы» — видит все ссылки всех проектов, комментарии, реакции, согласования. Может ответить inline, перейти в lightbox по клику

**Принципы:**
- WebSocket-first — polling только fallback при потере соединения
- Иконки комментариев — `MessageSquare` (квадратная). Иконка `Sparkles` запрещена на уровне проекта
- Иконка отправки — `SendHorizontal` (стрелка вправо). НЕ `Send` (самолётик)
- Badge цвет — `primary` (фиолетовый). НЕ `emerald-500`
- Все user-facing тексты на русском
- Отправка комментариев — Enter (Shift+Enter для переноса строки)

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

**Constraint:** `comment_single_target` — ровно одна из `scene`, `element`, `shared_link` заполнена.

**Validation (`clean()`):** Reply должен быть к тому же target что и parent.

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

**Защита от дублей guest→auth:** При реакции с `user_` session бэкенд удаляет старые guest-записи того же `author_name` для элемента.

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

**Защита от дублей guest→auth:** Аналогично реакциям — `user_` session чистит guest-записи.

---

## API endpoints

Файлы: `backend/apps/sharing/views.py`, `backend/apps/sharing/urls.py`

### Публичные (AllowAny, rate limited)

| Method | URL | View | Throttle | Описание |
|--------|-----|------|----------|----------|
| GET | `/api/sharing/public/{token}/` | `public_share_view` | 120/min | Загрузить раскадровку + мета: `created_at`, `expires_at`, `total_elements`, `link_name`. Группировка по сценам. `is_expired()` → 410 |
| POST | `/api/sharing/public/{token}/comments/` | `public_comment_view` | 60/min | Создать комментарий. WS broadcast включает `parent_id` |
| POST | `/api/sharing/public/{token}/reactions/` | `public_reaction_view` | 60/min | Лайк/дизлайк. Auto-cleanup guest duplicates при `user_` session |
| POST | `/api/sharing/public/{token}/review/` | `public_review_action` | 60/min | Согласование. Auto-cleanup guest duplicates |

**Особенности `public_share_view`:**
- Comment count считается вручную (top-level + replies), НЕ через `Count()` annotation
- Likes/dislikes считаются из prefetched reactions, НЕ через annotation (из-за JOIN-дупликатов с `distinct=True`)
- Response включает `general_comments`, `created_at`, `expires_at`, `total_elements`, `link_name`

### Приватные (IsAuthenticated)

| Method | URL | View | Описание |
|--------|-----|------|----------|
| GET/POST/PATCH/DELETE | `/api/sharing/links/` | `SharedLinkViewSet` | CRUD ссылок. Create требует `feature_required('sharing')` |
| GET/POST | `/api/sharing/elements/{id}/comments/` | `element_comments_view` | Комментарии к элементу (owner only). Throttle: 120/min |
| GET/POST | `/api/sharing/scenes/{id}/comments/` | `scene_comments_view` | Комментарии к сцене (owner only). Throttle: 120/min |
| GET/POST | `/api/sharing/links/{id}/comments/` | `link_comments_view` | Общие комментарии к ссылке (owner only). Throttle: 120/min |
| GET | `/api/sharing/all-feedback/` | `all_feedback_view` | **Глобальный фидбек** по всем ссылкам пользователя |
| GET | `/api/sharing/project-feedback/{id}/` | `project_feedback_view` | Фидбек по ссылкам одного проекта |
| PATCH | `/api/sharing/comments/{id}/read/` | `mark_comment_read` | Пометить прочитанным + sync Notification |
| POST | `/api/sharing/comments/read-all/` | `mark_all_comments_read` | Все комментарии проекта прочитаны + sync всех feedback Notification types |

### all-feedback / project-feedback response format

```json
{
  "links": [
    {
      "id": 1,
      "name": "Для клиента v2",
      "token": "uuid-string",
      "project_id": 5,
      "project_name": "Рекламный ролик",
      "created_at": "2026-04-10T12:00:00Z",
      "expires_at": null,
      "is_expired": false,
      "unread_count": 3,
      "stats": { "approved": 3, "changes_requested": 1, "rejected": 0, "total_elements": 5 },
      "elements": [
        {
          "id": 42,
          "scene_id": 13,
          "original_filename": "shot-01.jpg",
          "thumbnail_url": "https://...",
          "element_type": "IMAGE",
          "review_summary": { "action": "approved", "author_name": "Дмитрий" },
          "reviews": [...],
          "likes": 2,
          "dislikes": 0,
          "comments": [{ "id": 1, "author_name": "Анна", "text": "...", "is_read": false, "replies": [...] }]
        }
      ],
      "general_comments": [...]
    }
  ]
}
```

**`unread_count` считает:**
- Непрочитанные комментарии (`Comment.is_read=False`, не от создателя)
- Непрочитанные Notification типов `reaction_new`, `review_new` для элементов ссылки
- Для expired ссылок всегда 0

### `mark_all_comments_read` синхронизация

Помечает прочитанным:
1. Все `Comment` записи проекта (`is_read=True`)
2. Все `Notification` типов `comment_new`, `reaction_new`, `review_new` для проекта

### Review summary — worst-wins агрегация

```python
priority = {'rejected': 0, 'changes_requested': 1, 'approved': 2}
worst = min(reviews, key=lambda r: priority.get(r.action, 99))
```

---

## Notification система

### Backend

Файл: `backend/apps/notifications/views.py`

**`GET /api/notifications/unread-count/`** возвращает:
```json
{ "count": 55, "feedback_count": 3 }
```
- `count` — non-feedback unread (для колокольчика)
- `feedback_count` — feedback unread (для кнопки «Ссылки и отзывы»)

### Frontend store

Файл: `frontend/lib/store/notifications.ts`

```
feedbackUnreadCount  ← из API /unread-count/ (feedback_count)
unreadCount          ← из API /unread-count/ (count, non-feedback)
```

**WS event `addNotification`:** feedback → инкрементит `feedbackUnreadCount`, non-feedback → `unreadCount`.

**Разделение каналов:**

| Канал | Что показывает | Данные |
|-------|---------------|--------|
| Bell icon (колокольчик) | generation, upload, system | `unreadCount` из store |
| Кнопка «Ссылки и отзывы» | comment_new, reaction_new, review_new | `feedbackUnreadCount` из store |

### Mark-read flow

1. Пользователь открывает overlay «Ссылки и отзывы»
2. Per-link badge показывает `unread_count` из API
3. При раскрытии accordion → `markAllCommentsRead(projectId)` → Comment + Notification помечены
4. При закрытии overlay → `markAllCommentsRead` для всех проектов + `feedbackUnreadCount = 0` в store
5. Expired ссылки: unread не считаются, mark-read не вызывается

---

## WebSocket

### PublicShareConsumer (для ревьюеров)

Файл: `backend/apps/sharing/consumers.py`
URL: `ws/sharing/{token}/`

**Events (server → client):**

| Event | Payload |
|-------|---------|
| `new_comment` | `{type, comment_id, element_id?, scene_id?, shared_link_id?, parent_id?, author_name, text, created_at, session_id}` |
| `reaction_updated` | `{type, element_id, likes, dislikes, session_id, value}` |
| `review_updated` | `{type, element_id, session_id, author_name, action}` |

**Важно:** `new_comment` включает `parent_id` — для правильного вложения replies.

### Дедупликация комментариев

На share page WS handler **пропускает комментарии от своей сессии** (`data.session_id === sessionId`). Отправитель добавляет комментарий оптимистично из API response — WS нужен только для других участников. Это решает race condition между HTTP response и WS broadcast.

---

## Frontend — сторона ревьюера

### Публичная страница `/share/[token]`

Файл: `frontend/app/share/[token]/page.tsx`

**State:**
- `project` — данные раскадровки (elements, scenes, general_comments, created_at, expires_at, total_elements)
- `commentsMap: Record<number, Comment[]>` — комментарии по element_id
- `generalComments: Comment[]` — общие комментарии к ссылке
- `reactionsMap`, `reviewMap` — реакции и ревью текущего пользователя
- `newCommentCounts: Record<number, number>` — новые комментарии от других (для badge +N)
- `newGeneralCount: number` — новые общие комментарии
- `discussionOpen: boolean` — overlay обсуждения

**Header ревьюера (адаптивный, 1 ряд на sm+, 2 ряда на xs):**
- Logo (только иконка на <md, полное имя на md+)
- По центру (sm+): название проекта + мета (дата, кол-во элементов, срок ссылки / «бессрочная»)
- На xs: отдельный второй ряд header'а с названием + меткой срока действия
- Справа (единый стиль, квадратные h-9 кнопки):
  - Кнопка «Обсуждение» (icon-only на xs с badge непрочитанного)
  - `DisplaySettingsPopover`
  - `ReviewerIdentityMenu` — popover с аватаром-инициалами / иконкой, в попапе:
    1) блок «Вы вошли как: {name}» (имя — Username auth-юзера или guest-имя)
    2) `ReviewerNameInput` для гостей (ввод имени)
    3) переключатель темы (Sun/Moon) — тема живёт в `next-themes`
- Navbar z-index: `z-[70]` (выше overlay `z-[60]`)
- Discussion overlay стартует с `top-0` и имеет `pt-[72px] sm:pt-[60px]` — под высоту 2-рядного / 1-рядного header'а

**ElementCard ревьюера** — унифицирован с workspace:
- Top-right: badge типа медиа (Video/Image) + AI badge — `rounded-md bg-black/60 backdrop-blur-sm h-6 w-6`
- Top-left: comment count badge — `rounded-md bg-black/60 backdrop-blur-sm h-6 px-1.5` + `+N` new indicator
- Hover overlay: `bg-overlay` с download кнопкой (bottom-left). Скачивание через fetch→blob→download (как в Lightbox)
- Review status bar 3px (top)
- Action bar: like/dislike кнопки

**Overlay «Обсуждение»** (`discussionOpen`):
- Full-page overlay (`fixed inset-0 top-[45px] z-[60]`)
- Все элементы с thumbnail, статусом, реакциями, комментариями
- CommentThread с `collapsedLimit={3}` — последние 3 комментария, кнопка «Показать ещё N» (пачками по 10)
- Клик по thumbnail/кнопке → закрывает overlay → открывает lightbox
- Секция «Общее обсуждение» внизу
- ESC / клик по backdrop → закрыть

**Toast уведомления от WS:** при новом комментарии от другого участника — toast с автором и текстом.

### ReviewerLightbox

Файл: `frontend/components/sharing/ReviewerLightbox.tsx`

- z-index: `z-[80]` (выше navbar и overlay)
- CommentThread с `pinInputBottom` — input прибит к низу панели
- Иконки: `MessageSquare`, `SendHorizontal`

### CommentThread

Файл: `frontend/components/sharing/CommentThread.tsx`

- Props: `collapsedLimit?: number`, `pinInputBottom?: boolean`
- `collapsedLimit`: показывает последние N комментариев, кнопка «Показать ещё M из K комментариев» (пачками по 10)
- Enter отправляет (Shift+Enter — перенос)
- Иконка: `SendHorizontal`

---

## Frontend — сторона создателя

### Overlay «Ссылки и отзывы»

Файл: `frontend/components/sharing/ReviewsOverlay.tsx`

**Точка входа:** Кнопка «Ссылки и отзывы» в toolbar — доступна на ВСЕХ уровнях:
- Корень проектов (ProjectGrid)
- Внутри проекта (WorkspaceContainer)

**Всегда глобальный:** загружает `getAllFeedback()` — все ссылки всех проектов.

**Layout:** `fixed inset-0 top-12 z-[60]`

**Заголовок:** «Ссылки и отзывы» + подзаголовок «Обратная связь по ссылкам для просмотра»

**Accordion по ссылкам:**
- Все свёрнуты по умолчанию
- Header: chevron + Link icon + «Проект / Название ссылки» + дата + кол-во элементов + stats + LinkStatusBadge + unread badge + кнопки copy/delete (hover)
- Expand → `markAllCommentsRead(projectId)` → badge обнуляется
- Delete → shadcn Dialog подтверждения (не window.confirm)

**LinkStatusBadge:**
- Бессрочная → `bg-primary/10 text-primary`
- N дней → `bg-primary/10 text-primary`
- Истекла → `bg-muted text-muted-foreground`
- Expired ссылки приглушены (`opacity-60`), badge не показывается

**Элементы с фидбеком:**
- Thumbnail (click → lightbox с навигацией кросс-проект)
- Highlight непрочитанных: `bg-primary/5` на элементе + badge «N новых»
- Комментарии: `CollapsedComments` (последние 3, +10 пачками)
- Непрочитанные комментарии: `bg-primary/5` фон + метка «новое»
- Reply: кнопка на каждом комментарии, indicator в ReplyInput

**Mark-read при закрытии:** `markAllCommentsRead` для каждого проекта + `feedbackUnreadCount = 0`

**Навигация в lightbox:** `onOpenLightbox(elementId, sceneId, projectId)` → если элемент в текущем view — открыть lightbox. Иначе → `router.push(/projects/{pid}/groups/{sceneId}?lightbox={elementId})`

### Badge на кнопке «Ссылки и отзывы»

- Источник: `feedbackUnreadCount` из notification store
- Загружается из `/api/notifications/unread-count/` → `feedback_count`
- Обновляется по WS: `addNotification()` инкрементит для feedback types
- Обнуляется при закрытии overlay

---

## Безопасность

- **XSS:** `strip_tags()` на `text` и `author_name` в backend views
- **Rate limiting:** `anon: 120/min`, `user: 600/min`, `auth_comment: 120/min`. Public endpoints — `AnonRateThrottle`
- **Token security:** UUID4 (122 бита энтропии). Пароль на ссылку не нужен
- **Guest→Auth дедупликация:** При `user_` session бэкенд автоматически удаляет guest-записи того же author_name (реакции + ревью)
- **Expired links:** Все public endpoints → 410 Gone. Unread count = 0 для expired

---

## Известные ограничения

1. **N+1 в feedback views** — цикл по ссылкам делает отдельные запросы. Оптимизировать при 10+ ссылках
2. **ReviewsOverlay не обновляется по WS** — данные при открытии, не слушает WS events в реальном времени
3. **Per-project mark-read** — `markAllCommentsRead` помечает весь проект, а не конкретную ссылку. Если 2 ссылки одного проекта — обе обнулятся
4. **Нет ролей ревьюеров** — любой может согласовать/отклонить. Планируется: ЛПР vs обычный ревьюер (бэклог)
5. **Один элемент в нескольких ссылках** — комментарии привязаны к элементу, видны во всех ссылках. Это корректное поведение (аналогия: Google Docs)

---

## Карта файлов

```
backend/apps/sharing/
├── models.py          → SharedLink, Comment, ElementReaction, ElementReview
├── views.py           → 17 views (public + private + feedback + mark-read)
├── urls.py            → URL routing (включая all-feedback)
├── serializers.py     → 7 serializers
├── consumers.py       → PublicShareConsumer (WebSocket)
├── routing.py         → WS URL: ws/sharing/{token}/
├── permissions.py     → IsProjectOwner
├── services.py        → create_shared_link (legacy)

backend/apps/notifications/
├── views.py           → unread_count (count + feedback_count)
└── services.py        → notify_new_comment, notify_reaction_updated, notify_review_updated

frontend/components/sharing/
├── ReviewsOverlay.tsx       → Overlay «Ссылки и отзывы» (глобальный, accordion)
├── ReviewerLightbox.tsx     → Lightbox для ревьюера (z-[80])
├── CommentThread.tsx        → Тред комментариев (collapsedLimit, pinInputBottom)
├── ReviewerNameInput.tsx    → Ввод имени
├── CreateLinkDialog.tsx     → Создание ссылки
├── ShareLinksPanel.tsx      → [DEPRECATED — функционал перенесён в ReviewsOverlay]
└── ShareSelectionMode.tsx   → Выбор элементов

frontend/app/share/[token]/
└── page.tsx                 → Публичная страница (WS, discussion overlay, унифицированные карточки)

frontend/components/element/
├── ElementCard.tsx          → Карточка workspace (полоска 3px, badges)
└── WorkspaceContainer.tsx   → WS handlers + ReviewsOverlay toggle + feedback badge

frontend/components/project/
└── ProjectGrid.tsx          → Кнопка «Ссылки и отзывы» + ReviewsOverlay

frontend/lib/
├── api/sharing.ts           → 22 API функции (включая getAllFeedback)
├── api/notifications.ts     → unreadCount возвращает {count, feedback_count}
├── store/notifications.ts   → feedbackUnreadCount + unreadCount (раздельные)
└── types/index.ts           → ProjectFeedbackLink (с expires_at, is_expired, created_at, project_id)
```
