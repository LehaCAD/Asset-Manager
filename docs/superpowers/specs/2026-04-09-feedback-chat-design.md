# Чат обратной связи — Design Spec

> Дата: 2026-04-09
> Статус: Review v1 (post spec-review fixes)

## Цель

Дать пользователям прямой канал связи с создателем платформы: сообщить о баге, задать вопрос, предложить идею. Админ видит все обращения в Telegram-стиле, отвечает, награждает Кадрами за полезную обратную связь.

## Scope — MVP

### Входит
- Pill «Связаться с нами» в navbar (все страницы)
- Dropdown: быстрое сообщение + превью последних сообщений + ссылка на полную переписку
- Полная страница чата `/cabinet/feedback` (история, вложения)
- Загрузка фото/файлов (jpg, png, webp, pdf — до 10 МБ, max 5 вложений на сообщение)
- Админка `/admin/feedback` (is_staff only) — Telegram-стиль: список диалогов + чат
- Теги: баг / вопрос / идея
- Начисление Кадров за репорт (CreditsService.topup)
- Статусы: открыт / решён
- WebSocket real-time (оба направления)
- Кликабельное имя юзера → Django Admin

### Отложено
- Голосовые сообщения (MediaRecorder)
- Автоответы / шаблоны
- Раскрывающийся профиль юзера в админке (журнал генераций, ошибки)
- Множественные диалоги (1 юзер = 1 тред в MVP)
- Email-уведомления о новых сообщениях
- Статистика обращений
- Приоритеты обращений

## Что уже есть в кодовой базе

| Компонент | Статус | Переиспользование |
|-----------|--------|-------------------|
| WebSocket infra (Daphne, Channels, JWTAuthMiddleware) | Работает | Новый consumer по паттерну ProjectConsumer |
| S3 upload pipeline (staging → Celery → S3 → presigned) | Работает | Тот же flow для вложений |
| CreditsService.topup() | Работает | Вызов с reason="feedback_reward" |
| Notification consumer (ws/notifications/) | Работает | Уведомления о новых ответах админа |
| CommentThread.tsx | Работает | Паттерн UI: аватар, бабблы, textarea+send |
| NotificationDropdown.tsx | Работает | Паттерн для dropdown обратной связи |
| Django Admin (CustomUserAdmin + CreditsTransactionInline) | Работает | Ссылка на профиль юзера |

---

## 1. Модели данных

### Новое приложение: `backend/apps/feedback/`

```python
# models.py

class Conversation(models.Model):
    """Один юзер = один диалог (в MVP)."""
    user = OneToOneField(User, on_delete=CASCADE, related_name='feedback_conversation')
    status = CharField(
        max_length=20,
        choices=[('open', 'Открыт'), ('resolved', 'Решён')],
        default='open',
    )
    tag = CharField(
        max_length=20,
        choices=[('bug', 'Баг'), ('question', 'Вопрос'), ('idea', 'Идея')],
        blank=True,
    )
    user_last_read_at = DateTimeField(null=True, blank=True)   # когда юзер последний раз открыл чат
    admin_last_read_at = DateTimeField(null=True, blank=True)  # когда админ последний раз открыл чат
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)  # обновляется при каждом новом сообщении

    class Meta:
        ordering = ['-updated_at']


class Message(models.Model):
    """Сообщение в диалоге."""
    conversation = ForeignKey(Conversation, on_delete=CASCADE, related_name='messages')
    sender = ForeignKey(User, on_delete=CASCADE)
    is_admin = BooleanField(default=False)
    text = TextField(max_length=5000, blank=True)
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']


class Attachment(models.Model):
    """Вложение к сообщению. Изображения хранятся в 800px, без оригиналов."""
    message = ForeignKey(Message, on_delete=CASCADE, related_name='attachments')
    file_key = CharField(max_length=500)          # S3 key (final, после resize)
    file_name = CharField(max_length=255)          # оригинальное имя
    file_size = PositiveIntegerField()             # байты (после resize)
    content_type = CharField(max_length=100)       # MIME
    created_at = DateTimeField(auto_now_add=True)


class FeedbackReward(models.Model):
    """Награда за обратную связь."""
    conversation = ForeignKey(Conversation, on_delete=CASCADE, related_name='rewards')
    amount = DecimalField(max_digits=10, decimal_places=2)
    comment = CharField(max_length=200, blank=True)  # "За репорт бага с загрузкой"
    transaction = ForeignKey(
        'credits.CreditsTransaction', on_delete=SET_NULL, null=True,
    )
    granted_by = ForeignKey(User, on_delete=CASCADE)  # admin
    created_at = DateTimeField(auto_now_add=True)
```

### Решения по модели

- **OneToOneField** для Conversation → User: в MVP один юзер = один тред. При переходе к множественным диалогам — миграция на ForeignKey, обратно совместимо.
- **is_admin** на Message вместо проверки sender.is_staff: явно, не зависит от смены роли.
- **FeedbackReward** отдельная модель (не поле на Conversation): юзер может получить несколько наград в рамках одного диалога.
- **Attachment** без URLField: URL генерируется presigned, не хранится. Хранится только S3 key.
- **Read tracking** через `user_last_read_at` / `admin_last_read_at` на Conversation: непрочитанные сообщения = те, что `created_at > last_read_at` для соответствующей стороны. Простой подход без отдельной модели ReadReceipt.

---

## 2. API endpoints

Новый prefix: `/api/feedback/`

### User-facing

```
GET  /api/feedback/conversation/          → Получить свой диалог (или 404)
POST /api/feedback/conversation/          → Создать диалог (если нет)
GET  /api/feedback/messages/              → Список сообщений (pagination, cursor-based)
POST /api/feedback/messages/              → Отправить сообщение
POST /api/feedback/messages/{id}/presign/  → Получить presigned PUT URL для загрузки в S3
POST /api/feedback/messages/{id}/confirm-attach/ → Подтвердить загрузку, запустить resize
POST /api/feedback/conversation/read/     → Обновить user_last_read_at (вызывается при открытии чата)
```

### Admin-facing (is_staff)

```
GET    /api/feedback/admin/conversations/              → Список диалогов (фильтры: status, tag, search)
GET    /api/feedback/admin/conversations/{id}/          → Детали диалога + user info
PATCH  /api/feedback/admin/conversations/{id}/          → Обновить status, tag
GET    /api/feedback/admin/conversations/{id}/messages/ → Сообщения диалога
POST   /api/feedback/admin/conversations/{id}/messages/ → Ответ админа
POST   /api/feedback/admin/conversations/{id}/reward/   → Начислить Кадры
POST   /api/feedback/admin/conversations/{id}/read/    → Обновить admin_last_read_at
DELETE /api/feedback/admin/messages/{id}/               → Удалить сообщение (модерация)
```

### Serializers

```python
# User conversation detail
class ConversationSerializer:
    fields: id, status, tag, created_at, updated_at, last_message_preview, unread_count

# Message
class MessageSerializer:
    fields: id, sender_name, is_admin, text, attachments, created_at

# Attachment (nested in Message)
class AttachmentSerializer:
    fields: id, file_name, file_size, content_type, url (presigned), thumbnail_url

# Admin conversation list item
class AdminConversationListSerializer:
    fields: id, user (id, username, email, date_joined, balance), status, tag,
            last_message_preview, last_message_at, unread_by_admin, rewards_total

# Admin reward
class RewardSerializer:
    fields: amount, comment
```

---

## 3. WebSocket

### Новый consumer: `FeedbackChatConsumer`

```python
# Маршрут: ws/feedback/{conversation_id}/
# Группа: feedback_{conversation_id}

class FeedbackChatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        # Аутентификация через JWTAuthMiddleware (уже в ASGI pipeline)
        # Проверка: user == conversation.user OR user.is_staff
        # group_add('feedback_{conversation_id}')

    async def new_message(self, event):
        # Отправляет сообщение обоим участникам
        # {type: 'new_message', message: MessageSerializer.data}

    async def conversation_updated(self, event):
        # Статус/тег изменился
        # {type: 'conversation_updated', status, tag}

    async def reward_granted(self, event):
        # Начислены Кадры
        # {type: 'reward_granted', amount, comment}

    async def attachment_ready(self, event):
        # Вложение обработано Celery и загружено в S3
        # {type: 'attachment_ready', message_id, attachment: AttachmentSerializer.data}
        # Frontend обновляет placeholder вложения на реальное превью
```

### Уведомления

При новом сообщении от юзера → Notification(type='feedback_new') → отправка в группу `user_{admin_id}` через существующий NotificationConsumer.

При ответе админа → Notification(type='feedback_reply') → отправка в группу `user_{user_id}`.

---

## 4. Загрузка файлов

### Flow: presigned upload → resize (без staging на сервере)

```
Шаг 1: POST /api/feedback/messages/ {text: "описание бага"}
  → Создаётся Message, возвращается message.id
  → WebSocket: new_message (текст, пока без вложений)

Шаг 2: POST /api/feedback/messages/{id}/presign/ {file_name, content_type}
  → Backend: валидация MIME (whitelist), генерация presigned PUT URL
  → Возвращает: {upload_url, file_key} (S3 prefix: feedback/tmp/{uuid}{ext})

Шаг 3: Frontend: PUT файл напрямую в S3 по presigned URL
  → Трафик идёт: браузер → S3. Сервер не участвует.

Шаг 4: POST /api/feedback/messages/{id}/confirm-attach/ {file_key, file_name, file_size}
  → Backend: проверяет что файл существует в S3 tmp
  → Celery task: process_feedback_attachment
    → Download из S3 tmp (в память, файл маленький)
    → Resize до 800px longest side (Pillow, quality=85, strip EXIF)
    → Upload в S3 final: feedback/{conversation_id}/{uuid}.jpg
    → Delete S3 tmp файл
    → Create Attachment record (с file_size после resize)
    → WebSocket: attachment_ready
```

**Ключевое:** сервер и Celery НЕ качают оригинал от юзера. Юзер грузит в S3 напрямую. Celery только ресайзит (скачать ~2МБ из S3, обработать, залить ~200КБ обратно — секунды).

**Обработка ошибок:** Если resize падает — tmp-файл остаётся в S3. Periodic task `cleanup_feedback_tmp` (раз в час) удаляет файлы в `feedback/tmp/` старше 1 часа. Юзер видит ошибку, может retry.

**PDF:** не ресайзится, копируется из tmp в final as-is (лимит 10 МБ на файл).

### Rate limiting

Отложено. В MVP единственный админ видит спам сразу, есть «заблокировать» в модерации. При росте — `UserRateThrottle`.

### Хранилище

- **Оригиналы не хранятся** — только 800px resize (~200-300 КБ на файл)
- Per-file upload limit: 10 МБ (до resize, проверяется на фронте + presigned URL с Content-Length condition)
- **Без per-conversation лимита** — при 800px resize объёмы мизерные
- **Автоочистка**: Celery periodic task раз в сутки удаляет вложения старше 90 дней. Attachment запись остаётся с флагом `is_expired=True`, юзер видит плейсхолдер «Вложение удалено (срок хранения истёк)». Сообщения и текст — бессрочно
- **Админ может удалить** любое вложение вручную из интерфейса
- Feedback-вложения НЕ считаются в квоту хранилища юзера (отдельный S3 prefix `feedback/`)
- Staging (S3 `feedback/tmp/`) — cleanup каждый час для файлов старше 1 часа

### Безопасность

| Правило | Значение |
|---------|----------|
| Допустимые MIME | image/jpeg, image/png, image/webp, application/pdf |
| Валидация при presign | Whitelist content_type на бэкенде (перед выдачей presigned URL) |
| Валидация при confirm | python-magic (magic bytes) на скачанном из S3 tmp файле |
| Max размер upload | 10 МБ (Content-Length condition в presigned URL) |
| Max вложений на сообщение | 5 |
| Изображения | Resize 800px + re-encode (Pillow: strip EXIF, convert RGB, quality=85). Оригинал удаляется |
| PDF | Копируется as-is из tmp в final (лимит 10 МБ) |
| S3 tmp path | `feedback/tmp/{uuid}{ext}` — транзитная зона, cleanup каждый час |
| S3 final path | `feedback/{conversation_id}/{uuid}{ext}` — изолировано от проектов |
| Подача | Presigned GET URL, TTL 1 час |
| ClamAV | Не нужен (whitelist MIME + re-encode + автоочистка) |
| python-magic | Новая зависимость: добавить в requirements.txt + libmagic1 в Dockerfile |

---

## 5. Система наград

### Flow

```
Admin: кнопка «⚡ Начислить» → модалка с суммой + комментарий
  → POST /api/feedback/admin/conversations/{id}/reward/
  → Backend:
    1. CreditsService.topup(user, amount, reason='feedback_reward', metadata={'comment': ...})
    2. FeedbackReward.create(conversation, amount, comment, transaction, granted_by)
    3. Системное сообщение в чат: "⚡ Начислено {amount} Кадров: {comment}"
    4. WebSocket: reward_granted → юзер видит в реальном времени
    5. Notification(type='feedback_reward') → колокольчик юзера
```

### Добавление reason в CreditsService

В `REASON_CHOICES` добавить: `('feedback_reward', 'Награда за обратную связь')` + константу `REASON_FEEDBACK_REWARD = "feedback_reward"` на модели CreditsTransaction (по паттерну существующих констант).

**Примечание:** `topup()` возвращает `BalanceMutationResult`, не объект транзакции. Для записи FK в `FeedbackReward.transaction` — после `topup()` сделать `CreditsTransaction.objects.filter(user=user).latest('created_at')` или модифицировать `topup()` чтобы возвращал транзакцию в result.

---

## 6. Frontend — компоненты

### 6.1. Navbar: pill «Связаться с нами»

**Расположение:** между балансом и колокольчиком уведомлений.

```
[⚡ 1 250] [💬 Связаться с нами] [🔔] [🌙] [LE]
```

- Компонент: `FeedbackButton` в `components/layout/`
- Иконка: `MessageCircle` из lucide-react
- Стиль: pill с `bg-primary/10 border-primary/20 text-primary`
- Badge: зелёная точка если есть непрочитанный ответ от админа
- Клик: открывает `FeedbackDropdown`

### 6.2. FeedbackDropdown

Компонент: `components/feedback/FeedbackDropdown.tsx`

Popover (как NotificationDropdown):
- **Шапка:** «Связаться с нами» + кнопка закрытия
- **Тело:** превью последних 5 сообщений (бабблы, как в чате)
- **Input:** textarea + кнопка «📎» + кнопка «➤ Отправить»
- **Footer:** ссылка «Перейти к полной переписке →» → `/cabinet/feedback`
- Max ширина: 320px

Если диалога ещё нет — показывает приветственный текст:
> «Нашли баг? Есть идея? Напишите — мы читаем каждое сообщение.»

Под полем ввода — мелкий текст (muted, 10px):
> «Вложения хранятся 90 дней»

### 6.3. Страница /cabinet/feedback

Компонент: `components/feedback/FeedbackChat.tsx`

Полноэкранный чат в layout кабинета:
- Все сообщения с датами-разделителями
- Вложения: превью изображений (кликабельные), иконки файлов с размером
- Системные сообщения по центру (награды, смена статуса)
- Input bar: textarea + 📎 attach + ➤ send
- Статус диалога в шапке (открыт / решён)

Новый пункт в сайдбаре кабинета:
```
Инструменты:
  📦 Хранилище
  💬 Обратная связь    ← NEW
  🔔 Уведомления
  ⚙️ Профиль
```

### 6.4. Админка /admin/feedback

Компонент: `components/feedback/AdminFeedbackInbox.tsx`

**Доступ:** отдельная страница, проверка `is_staff` на фронте + бэкенде.

**Layout:** два столбца (sidebar 280px + main).

**Левая панель — список диалогов:**
- Поиск по имени/тексту
- Фильтры: все / открытые / решённые / по тегу
- Каждый item: аватар (инициалы), имя, превью, время, теги, награды
- Непрочитанные: dot-индикатор
- Сортировка: по updated_at (последнее сообщение наверху)

**Правая панель — чат:**
- Шапка: аватар, имя, @username (ссылка на Django Admin), email, дата регистрации, баланс
- Действия: «⚡ Начислить», «✓ Решено», тег-селектор, «•••» (удалить сообщение, заблокировать)
- Сообщения: бабблы (юзер слева, админ справа), вложения, системные
- Input: textarea + 📎 + ➤

### 6.5. Zustand store

Новый store: `lib/store/feedback.ts`

```typescript
interface FeedbackState {
  // User side
  conversation: Conversation | null
  messages: Message[]
  hasUnreadReply: boolean
  isLoading: boolean

  // Actions
  loadConversation: () => Promise<void>
  loadMessages: (cursor?: string) => Promise<void>
  sendMessage: (text: string) => Promise<void>
  uploadAttachment: (messageId: number, file: File) => Promise<void>
  markAsRead: () => Promise<void>
}
```

Админский store отдельно: `lib/store/feedback-admin.ts`

```typescript
interface FeedbackAdminState {
  conversations: AdminConversation[]
  activeConversation: AdminConversation | null
  messages: Message[]
  filters: { status?: string; tag?: string; search?: string }

  loadConversations: () => Promise<void>
  selectConversation: (id: number) => Promise<void>
  sendReply: (text: string) => Promise<void>
  updateConversation: (id: number, data: Partial<Conversation>) => Promise<void>
  grantReward: (id: number, amount: number, comment: string) => Promise<void>
}
```

### 6.6. API client

Новый файл: `lib/api/feedback.ts`

```typescript
export const feedbackApi = {
  // User
  getConversation: () => client.get('/feedback/conversation/'),
  createConversation: () => client.post('/feedback/conversation/'),
  getMessages: (cursor?: string) => client.get('/feedback/messages/', { params: { cursor } }),
  sendMessage: (text: string) => client.post('/feedback/messages/', { text }),
  uploadAttachment: (messageId: number, file: File) => {
    const form = new FormData(); form.append('file', file);
    return client.post(`/feedback/messages/${messageId}/attach/`, form);
  },

  // Admin
  getConversations: (filters) => client.get('/feedback/admin/conversations/', { params: filters }),
  getConversationDetail: (id) => client.get(`/feedback/admin/conversations/${id}/`),
  getConversationMessages: (id, cursor?) => client.get(`/feedback/admin/conversations/${id}/messages/`, { params: { cursor } }),
  sendAdminReply: (id, text) => client.post(`/feedback/admin/conversations/${id}/messages/`, { text }),
  updateConversation: (id, data) => client.patch(`/feedback/admin/conversations/${id}/`, data),
  grantReward: (id, amount, comment) => client.post(`/feedback/admin/conversations/${id}/reward/`, { amount, comment }),
}
```

---

## 7. WebSocket client

Новый файл: `lib/api/feedback-ws.ts`

Паттерн по аналогии с `notification-ws.ts`:

```typescript
class FeedbackWSManager {
  connect(conversationId: number): void
  disconnect(): void
  on(handler: (event: FeedbackWSEvent) => void): () => void
}

type FeedbackWSEvent =
  | { type: 'new_message'; message: Message }
  | { type: 'attachment_ready'; message_id: number; attachment: Attachment }
  | { type: 'conversation_updated'; status: string; tag: string }
  | { type: 'reward_granted'; amount: number; comment: string }
```

Маршрут: `ws/feedback/{conversation_id}/`

---

## 8. Файловая структура

### Backend

```
backend/apps/feedback/
├── __init__.py
├── models.py          → Conversation, Message, Attachment, FeedbackReward
├── serializers.py     → все serializers (user + admin)
├── views.py           → UserFeedbackViewSet, AdminFeedbackViewSet
├── urls.py            → /api/feedback/...
├── consumers.py       → FeedbackChatConsumer
├── routing.py         → ws/feedback/{conversation_id}/
├── tasks.py           → process_feedback_attachment, cleanup_feedback_tmp, cleanup_old_attachments (Celery)
├── services.py        → grant_reward(), process_attachment()
├── admin.py           → ConversationAdmin, MessageInline
└── apps.py
```

### Frontend

```
frontend/
├── app/(cabinet)/cabinet/feedback/page.tsx     → страница чата юзера
├── app/(workspace)/admin/feedback/page.tsx     → админка (is_staff only)
├── components/feedback/
│   ├── FeedbackButton.tsx                      → pill в navbar
│   ├── FeedbackDropdown.tsx                    → dropdown быстрого сообщения
│   ├── FeedbackChat.tsx                        → полноэкранный чат (user)
│   ├── AdminFeedbackInbox.tsx                  → Telegram-стиль админка
│   ├── MessageBubble.tsx                       → бабл сообщения (shared)
│   ├── AttachmentPreview.tsx                   → превью вложения (shared)
│   ├── RewardModal.tsx                         → модалка начисления Кадров
│   └── SystemMessage.tsx                       → системное сообщение
├── lib/api/feedback.ts                         → API client
├── lib/api/feedback-ws.ts                      → WebSocket manager
├── lib/store/feedback.ts                       → user store
└── lib/store/feedback-admin.ts                 → admin store
```

---

## 9. Маршрутизация и доступ

| Маршрут | Доступ | Назначение |
|---------|--------|------------|
| `/cabinet/feedback` | Авторизованный юзер | Полная страница чата |
| `/admin/feedback` | is_staff | Админский inbox |
| `/api/feedback/*` | JWT (user endpoints) | API юзера |
| `/api/feedback/admin/*` | JWT + is_staff | API админа |
| `ws/feedback/{id}/` | JWT (user или staff) | Real-time чат |

---

## 10. Миграции

Одна миграция: `0001_initial.py` — создание Conversation, Message, Attachment, FeedbackReward.

Обратно совместимая: новые таблицы, не трогает существующие.

Добавление `feedback_reward` в `REASON_CHOICES` кредитов — без миграции (CharField choices не требуют миграции в Django).

---

## 11. Интеграция с существующей системой

### Navbar (Navbar.tsx)
Добавить `FeedbackButton` + `FeedbackDropdown` между балансом и колокольчиком.

### Cabinet layout (cabinet/layout.tsx)
Добавить пункт «Обратная связь» (MessageCircle icon) в секцию «Инструменты» сайдбара.

### ASGI routing (config/asgi.py)
Создать `apps/feedback/routing.py` с паттерном `ws/feedback/{conversation_id}/` → `FeedbackChatConsumer`. В `asgi.py` импортировать и объединить с существующими `websocket_urlpatterns` из `apps/projects/routing` и `apps/notifications/routing`.

### URL config (config/urls.py)
Добавить `path('api/feedback/', include('apps.feedback.urls'))`.

### Settings (config/settings.py)
Добавить `'apps.feedback'` в `INSTALLED_APPS`.

---

## 12. Порядок реализации (ориентировочный)

1. Backend: модели + миграция + admin.py
2. Backend: serializers + views (user endpoints)
3. Backend: serializers + views (admin endpoints)
4. Backend: WebSocket consumer + routing
5. Backend: Celery task для вложений + services.py
6. Frontend: API client + types
7. Frontend: feedback store + feedback-ws
8. Frontend: FeedbackButton + FeedbackDropdown (navbar)
9. Frontend: FeedbackChat (cabinet page)
10. Frontend: AdminFeedbackInbox
11. Frontend: RewardModal + интеграция с CreditsService
12. Интеграция: navbar, cabinet layout, ASGI routing, urls
