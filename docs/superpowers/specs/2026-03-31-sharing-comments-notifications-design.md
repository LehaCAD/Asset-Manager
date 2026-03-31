# Шеринг, комментарии, уведомления — Design Spec

> Дата: 2026-03-31
> Статус: Review v2 (post code-review fixes)

## Цель

Дать создателю возможность поделиться работой из проекта, получить комментарии от ревьюеров (без регистрации), и видеть обратную связь через уведомления в реальном времени.

## Scope

- Шеринг элементов из проекта по ссылке (публичный доступ)
- Комментарии на двух уровнях: элемент и сцена (группа)
- Ответы на конкретные комментарии (reply)
- Уведомления: persistent модель + WebSocket live-доставка + UI колокольчик
- Страница ревьюера (`/share/{token}`)
- Интеграция комментариев в workspace создателя (DetailPanel в лайтбоксе)

## Что уже есть в кодовой базе

| Компонент | Статус | Примечание |
|-----------|--------|------------|
| `SharedLink` модель | Есть, нужна доработка | FK к Project, нет M2M к Element |
| `Comment` модель | Есть, нужна переработка | FK только к Scene, нет Element/parent/session_id |
| Сервисный слой (`sharing/services.py`) | Есть | Логика создания ссылок и комментариев |
| Тесты (`sharing/tests.py`) | Есть, 20 тестов | Нужно обновить под новую модель |
| Backend views | Отсутствуют | `views.py` пустой |
| URL routing | Отсутствует | Нет `urls.py`, не подключено в `config/urls.py` |
| Frontend types | Есть | `PublicProject`, `PublicScene`, `PublicElement`, `Comment`, `SharedLink` |
| Frontend API client (`sharing.ts`) | Есть | 5 методов, нужно обновить под новые эндпоинты |
| Frontend страница `/share/[token]` | Заглушка | "Phase 9" placeholder |
| WebSocket consumer | Есть | `ProjectConsumer` с заглушкой `new_comment` |
| Notification модель | Отсутствует | Только ephemeral WS, нет persistence |
| Notification UI | Заглушка | `cabinet/notifications/page.tsx` с пустым состоянием |
| Navbar колокольчик | Отсутствует | Нет ни иконки, ни dropdown |

---

## 1. Модели данных

### SharedLink (обновлённая)

```python
class SharedLink(models.Model):
    token = UUIDField(unique=True, default=uuid4, editable=False)
    project = FK(Project, on_delete=CASCADE, related_name='shared_links')
    created_by = FK(User, on_delete=CASCADE, related_name='shared_links')  # владелец
    name = CharField(max_length=100, blank=True)        # "Ревью для Кати"
    elements = M2M(Element)                              # конкретный набор, НЕ blank — минимум 1 элемент
    expires_at = DateTimeField(null=True, blank=True)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    def is_expired(self):
        return self.expires_at and self.expires_at < now()
```

Изменения относительно текущей модели:
- Добавлено: `created_by`, `name`, `elements` (M2M), `updated_at`
- `elements` без `blank=True` — ссылка без элементов не имеет смысла, валидация на уровне serializer
- `created_by` — для permission checks (владелец проекта), без него любой auth-пользователь мог бы менять чужие ссылки
- Убрано: ничего, обратно совместимо

### Comment (переработанная)

```python
class Comment(models.Model):
    # Привязка — ровно одно из двух
    scene = FK(Scene, null=True, blank=True, on_delete=CASCADE, related_name='comments')
    element = FK(Element, null=True, blank=True, on_delete=CASCADE, related_name='comments')

    # Reply threading
    parent = FK('self', null=True, blank=True, on_delete=CASCADE, related_name='replies')

    # Автор
    author_name = CharField(max_length=100)
    author_user = FK(User, null=True, blank=True, on_delete=SET_NULL)
    session_id = CharField(max_length=36)  # UUID для цвета аватарки

    # Контент
    text = TextField(max_length=2000)
    is_read = BooleanField(default=False)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)  # сохраняем из текущей модели

    class Meta:
        ordering = ['created_at']  # ИЗМЕНЕНИЕ: было '-created_at', теперь ascending для тред-UI
        constraints = [
            CheckConstraint(
                check=(Q(scene__isnull=False, element__isnull=True) |
                       Q(scene__isnull=True, element__isnull=False)),
                name='comment_single_target'
            )
        ]

    def clean(self):
        """Reply должен быть к тому же target, что и parent."""
        if self.parent:
            if self.parent.element != self.element or self.parent.scene != self.scene:
                raise ValidationError('Reply must target the same element/scene as parent.')
```

Изменения относительно текущей модели:
- Добавлено: `element`, `parent`, `author_user`, `session_id`, `clean()` валидация
- Сохранено: `updated_at` (было в текущей модели)
- Изменено: ordering с `-created_at` на `created_at` (тред читается сверху вниз)
- Убрано: связь с SharedLink (комментарии — единый тред, видимый всем)
- Constraint: ровно одно из scene/element заполнено
- Validation: reply должен указывать на тот же target, что и parent
- **Миграция:** существующие 20 тестов нужно обновить под новый ordering и новые поля

### Notification (новая модель)

```python
class Notification(models.Model):
    class Type(models.TextChoices):
        COMMENT_NEW = 'comment_new'
        GENERATION_COMPLETED = 'generation_completed'
        GENERATION_FAILED = 'generation_failed'

    user = FK(User, on_delete=CASCADE, related_name='notifications')
    type = CharField(max_length=30, choices=Type.choices)

    # Контекст
    project = FK(Project, null=True, on_delete=CASCADE)
    element = FK(Element, null=True, on_delete=SET_NULL)
    scene = FK(Scene, null=True, on_delete=SET_NULL)
    comment = FK(Comment, null=True, on_delete=SET_NULL)

    # Отображение
    title = CharField(max_length=200)     # "Новый комментарий от Кати"
    message = TextField(blank=True)        # Превью текста

    is_read = BooleanField(default=False)
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            Index(fields=['user', 'is_read', '-created_at']),
        ]
```

Notification создаётся в БД + дублируется через WebSocket (если пользователь онлайн). Двойная доставка: live + persistent.

**on_delete стратегия:**
- `project = CASCADE` — удаление проекта удаляет все уведомления (проект = контекст, без него уведомление бессмысленно)
- `element/scene/comment = SET_NULL` — удаление объекта не убивает уведомление, но клик покажет "Элемент был удалён"

**Синхронизация is_read:** при прочтении комментария через DetailPanel — соответствующая Notification тоже помечается прочитанной (через `comment` FK). Один источник правды для бейджа колокольчика.

---

## 2. API-эндпоинты

### Шеринг — для создателя (IsAuthenticated)

| Метод | URL | Body / Params | Ответ |
|-------|-----|---------------|-------|
| `POST` | `/api/sharing/links/` | `{project_id, element_ids[], name?, expires_at?}` | SharedLink |
| `GET` | `/api/sharing/links/?project={id}` | — | SharedLink[] |
| `PATCH` | `/api/sharing/links/{id}/` | `{name?, element_ids[]?, expires_at?}` | SharedLink |
| `DELETE` | `/api/sharing/links/{id}/` | — | 204 |

### Шеринг — для ревьюера (AllowAny, rate limited)

| Метод | URL | Body / Params | Ответ |
|-------|-----|---------------|-------|
| `GET` | `/api/sharing/public/{token}/` | — | `{project_name, scenes[{id, name, elements[], comments[]}]}` |
| `POST` | `/api/sharing/public/{token}/comments/` | `{text, author_name, session_id, element_id OR scene_id, parent_id?}` | Comment |

### Комментарии — для создателя (IsAuthenticated)

| Метод | URL | Body / Params | Ответ |
|-------|-----|---------------|-------|
| `GET` | `/api/elements/{id}/comments/` | — | Comment[] (с replies) |
| `GET` | `/api/scenes/{id}/comments/` | — | Comment[] (с replies) |
| `POST` | `/api/elements/{id}/comments/` | `{text, parent_id?}` | Comment |
| `POST` | `/api/scenes/{id}/comments/` | `{text, parent_id?}` | Comment |
| `PATCH` | `/api/sharing/comments/{id}/read/` | — | 200 |
| `POST` | `/api/sharing/comments/read-all/` | `{project_id}` | 200 |

Создатель комментирует через auth-эндпоинты. `author_name` берётся из `user.username`, `author_user` ставится автоматически.

### Уведомления (IsAuthenticated)

| Метод | URL | Body / Params | Ответ |
|-------|-----|---------------|-------|
| `GET` | `/api/notifications/` | `?type=&is_read=&page=` | Notification[] (paginated) |
| `GET` | `/api/notifications/unread-count/` | — | `{count: number}` |
| `PATCH` | `/api/notifications/{id}/read/` | — | 200 |
| `POST` | `/api/notifications/read-all/` | — | 200 |

### URL routing (config/urls.py)

```python
urlpatterns = [
    ...
    path('api/sharing/', include('apps.sharing.urls')),          # SharedLink CRUD + public endpoints
    path('api/notifications/', include('apps.notifications.urls')),  # Notification CRUD
    # Comment endpoints живут в sharing app (не в elements/scenes) для единой точки входа
]
```

`apps.notifications` получает `urls.py`, `views.py`, `serializers.py` (сейчас только `services.py`).

### Rate limits

| Эндпоинт | Лимит | По чему |
|-----------|-------|---------|
| `POST .../comments/` (public) | 10/min | IP + token |
| `GET .../public/{token}/` | 30/min | IP |
| Notification endpoints | user throttle (120/min) | User |

> Rate limit по IP + token, не по session_id — session_id клиентский и легко подделать.

### Валидация публичных эндпоинтов

- Ссылка не просрочена (`is_expired() == False`)
- `element_id` входит в `shared_link.elements` M2M
- `scene_id` — сцена, в которой есть хотя бы один расшаренный элемент
- `parent_id` — комментарий к тому же элементу/сцене
- `text` — max 2000 символов, strip HTML
- `author_name` — max 100 символов, непустой

---

## 3. WebSocket

### Архитектура каналов

Существующий `ProjectConsumer` (`ws/projects/{id}/`) — project-scoped. Для уведомлений этого недостаточно: пользователь может быть на странице списка проектов, в кабинете, или в другом проекте. Колокольчик в навбаре должен работать **на любой странице**.

**Решение: новый `NotificationConsumer`** (user-scoped).

```python
# routing.py
websocket_urlpatterns = [
    path('ws/projects/<int:project_id>/', ProjectConsumer.as_asgi()),  # существующий
    path('ws/notifications/', NotificationConsumer.as_asgi()),          # новый
]
```

`NotificationConsumer`:
- Подключается при загрузке любой authenticated-страницы (навбар монтирует)
- Group: `user_{user_id}`
- Принимает: `new_notification` events
- JWT auth через существующий `JWTAuthMiddleware`

`ProjectConsumer` — расширяется типом `new_comment` (для live-обновления тредов в workspace).

### Типы событий

```python
# ProjectConsumer (project-scoped) — live update тредов
'new_comment' → {
    type: 'new_comment',
    comment_id: int,
    element_id: int | null,
    scene_id: int | null,
    author_name: str,
    text: str,       # превью (первые 100 символов)
    created_at: str,
}

# NotificationConsumer (user-scoped) — колокольчик
'new_notification' → {
    type: 'new_notification',
    notification: {
        id, type, title, message,
        project_id, element_id, scene_id,
        created_at
    }
}
```

### Flow при создании комментария

```
Ревьюер POST /api/sharing/public/{token}/comments/
  → Comment.save()
  → channel_layer.group_send('project_{id}', new_comment)     # live тред
  → NotificationService.create(type='comment_new', user=project.owner, ...)
    → Notification.save() в БД
    → channel_layer.group_send('user_{owner_id}', new_notification)  # колокольчик
  → Если создатель онлайн → WebSocket → колокольчик + тред обновляются
  → Если оффлайн → увидит при следующем заходе (persistent DB)
```

### Fallback

Если WebSocket недоступен — колокольчик поллит `GET /api/notifications/unread-count/` каждые 30 секунд. Аналогично существующему fallback для element status polling.

---

## 4. UX создателя

### Режим выбора элементов для шеринга

1. Кнопка "Поделиться" на странице проекта
2. Workspace входит в режим выбора: чекбоксы на карточках элементов
3. Фильтры сверху: `Все | Фото | Видео | ★ Избранное`
4. Кнопка "Выбрать все видимые" для быстрого отбора после фильтрации
5. Навигация между сценами работает как обычно, выбор не сбрасывается
6. Плавающая панель снизу: `Выбрано: 12 элементов` → `Создать ссылку`
7. Мини-диалог: имя (опционально), срок (без срока / 7д / 30д / свой) → копирование ссылки

### Управление ссылками

На странице проекта — секция/панель "Ссылки для просмотра":
- Список активных ссылок (имя, дата, кол-во элементов, кол-во комментариев)
- Действия: скопировать, редактировать, удалить
- Бейдж с непрочитанными комментариями

### Комментарии в workspace

DetailPanel в лайтбоксе получает секцию "Комментарии" внизу:
- Единый тред на элемент (все ревьюеры + создатель)
- Reply: цитата родительского комментария (имя + начало текста)
- Один уровень вложенности визуально
- Бейдж непрочитанных на карточках в сетке элементов

### Колокольчик в навбаре

- Иконка колокольчика с бейджем (число непрочитанных)
- Dropdown при клике: последние 10 уведомлений
- Табы: `Все | Комментарии | Генерации`
- Клик на уведомление:
  - `comment_new` → открывает проект → лайтбокс на элементе → фокус на комментарий
  - `generation_completed` → открывает проект → лайтбокс на элементе
  - `generation_failed` → аналогично
- Ссылка "Все уведомления" → `cabinet/notifications/`

### Страница уведомлений в кабинете

Существующая заглушка `cabinet/notifications/page.tsx` → полноценная страница:
- Табы: `Все | Комментарии | Генерации`
- Список с пагинацией
- Кнопка "Отметить все прочитанными"

---

## 5. UX ревьюера

### Страница `/share/{token}`

- Шапка: лого, название проекта, имя ревьюера (после ввода)
- Контент: элементы сгруппированы по сценам, сцены — аккордеоны (раскрыты по умолчанию, стрелочка ▼ для сворачивания)
- Если все элементы из одной сцены / корня — плоская сетка без заголовков
- Бейдж 💬 на карточках с количеством комментариев
- Комментарии к сцене: разворачиваемый блок под заголовком сцены
- CTA внизу: ненавязчивая строка "Создавайте свои проекты на Раскадровке →"

### Лайтбокс ревьюера

Упрощённая версия существующего лайтбокса:
- Просмотр изображения/видео (с видео-контролами)
- Навигация ← → только по элементам из этой ссылки
- Filmstrip с расшаренными элементами
- Правая панель — комментарии (вместо DetailPanel)
- Нет: удаления, избранного, промпта, повтора, параметров генерации

### Идентификация ревьюера

- Первая попытка комментария → инлайн: "Как вас зовут?" + input
- Имя сохраняется в `localStorage`
- `session_id` (UUID) генерируется при первом визите → сохраняется в `localStorage` → определяет цвет аватарки
- Имя отображается в шапке, можно сменить

---

## 6. Edge cases

| Сценарий | Поведение |
|----------|-----------|
| Ссылка удалена | Доступ закрыт, комментарии остаются в БД (shared_link не на Comment) |
| Ссылка просрочена | Страница "Срок ссылки истёк", новые комментарии запрещены |
| Элемент удалён после шеринга | Исчезает из M2M, комментарии к нему удаляются (CASCADE) |
| Элемент перегенерирован | file_url меняется, старые комментарии остаются (MVP) |
| Сцена удалена | Элементы удаляются (CASCADE) → пропадают из ссылки |
| Пустая ссылка (все элементы удалены) | "Элементы были удалены" |
| Несколько ссылок на один элемент | Единый тред комментариев, видимый всем |
| Коллизия имён ревьюеров | Различаются по цвету аватарки (session_id) |
| Клик на уведомление → объект удалён | "Элемент был удалён" вместо краша |
| Спам-комментарии | Rate limit 10/min по IP + token |

---

## 7. TypeScript типы (обновлённые)

```typescript
// SharedLink
interface SharedLink {
  id: number
  token: string
  project: number
  created_by: number
  name: string
  element_ids: number[]
  expires_at: string | null
  created_at: string
}

// Comment (обновлённый)
interface Comment {
  id: number
  element: number | null
  scene: number | null
  parent: number | null
  author_name: string
  author_user: number | null
  session_id: string
  text: string
  is_read: boolean
  created_at: string
  replies: Comment[]  // вложенные ответы (1 уровень)
}

// Notification (новый)
interface Notification {
  id: number
  type: 'comment_new' | 'generation_completed' | 'generation_failed'
  project_id: number | null
  element_id: number | null
  scene_id: number | null
  comment_id: number | null
  title: string
  message: string
  is_read: boolean
  created_at: string
}

// WebSocket events (дополнение к существующим)
interface WSNewCommentEvent {
  type: 'new_comment'
  comment_id: number
  element_id: number | null
  scene_id: number | null
  author_name: string
  text: string
  created_at: string
}

interface WSNewNotificationEvent {
  type: 'new_notification'
  notification: Notification
}

// Публичные типы (обновлённые)
interface PublicProject {
  name: string
  scenes: PublicScene[]
}

interface PublicScene {
  id: number
  name: string
  order_index: number
  elements: PublicElement[]
  comments: Comment[]
}

interface PublicElement {
  id: number
  element_type: 'IMAGE' | 'VIDEO'
  file_url: string
  thumbnail_url: string
  comment_count: number
}
```

### Пагинация

- `GET /api/notifications/` — cursor-based пагинация (20 на страницу)
- `GET /api/elements/{id}/comments/` — без пагинации (MVP, треды обычно <50 комментариев)
- `GET /api/scenes/{id}/comments/` — без пагинации (аналогично)
- Публичные эндпоинты — без пагинации (элементы ограничены содержимым ссылки)

---

## 8. Элементы без сцены

Элементы могут лежать в корне проекта (без сцены, `scene=null`). На странице ревьюера такие элементы показываются в отдельной секции "Без группы" (или без заголовка, если все элементы безгрупповые). В публичном API ответе — `scene: null` или отдельный массив `ungrouped_elements[]`.

---

## 9. Что НЕ входит в scope

- Версионирование элементов (комментарии к конкретной версии)
- Email-уведомления о комментариях
- Push-уведомления (браузер)
- Подборки (review collections) — ручной набор из разных проектов
- Права доступа на ссылку (пароль, whitelist)
- Комментарии с привязкой к координатам на изображении
- Редактирование/удаление комментариев

---

## 10. Зависимости и порядок реализации

```
1. Модели (SharedLink update, Comment rewrite, Notification new)
   ↓
2. Backend: сервисы + views + urls для sharing
   ↓
3. Backend: Notification сервис + views + WebSocket events
   ↓
4. Frontend: режим выбора элементов + создание ссылки
   ↓
5. Frontend: страница ревьюера /share/[token] + лайтбокс
   ↓
6. Frontend: комментарии в DetailPanel (workspace создателя)
   ↓
7. Frontend: колокольчик + dropdown + страница уведомлений
```
