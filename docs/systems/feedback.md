# Обратная связь (Feedback)

> Актуальное состояние подсистемы. Обновлять при внесении изменений.
> Последнее обновление: 2026-04-11

---

## Назначение

Чат поддержки между пользователем и администратором. Один пользователь = один диалог (MVP). Real-time через WebSocket, с поддержкой вложений, наград, тегов и статусов.

## Приложение

`backend/apps/feedback/`

## Жизненный цикл диалога

```
[Клиент пишет] → Conversation(open) создаётся
     ↓
[Админ решает вопрос] → Нажимает «Решено» → status=resolved
     ↓
[24ч без сообщений] → Celery auto_close → status=closed
     ↓
[Клиент пишет снова] → Создаётся НОВЫЙ Conversation(open)
```

Один пользователь может иметь несколько диалогов (ForeignKey, не OneToOne).

| Статус | Для клиента | Для админа |
|--------|-------------|------------|
| `open` | Может писать, видит чат | Активный, в списке |
| `resolved` | Может писать (переоткроет) | В списке, ждёт закрытия |
| `closed` | Видит историю, не может писать. Новое сообщение → новый диалог | Серым в списке, можно merge |

**Merge диалогов:** Если клиент создал новый диалог по тому же вопросу, админ может объединить: все сообщения переносятся в целевой диалог, исходный удаляется.

## Модели

### Conversation (Диалог)

Файл: `backend/apps/feedback/models.py`

| Поле | Тип | Назначение |
|------|-----|------------|
| `user` | ForeignKey(User) | Владелец диалога (1 юзер = много диалогов) |
| `status` | CharField | `open` / `resolved` / `closed` |
| `tag` | CharField | `bug` / `question` / `idea` / пусто |
| `user_last_read_at` | DateTimeField, null | Когда юзер последний раз прочитал чат |
| `admin_last_read_at` | DateTimeField, null | Когда админ последний раз прочитал чат |
| `created_at` | auto_now_add | |
| `updated_at` | auto_now | Обновляется при каждом новом сообщении |

Ordering: `-updated_at` (свежие диалоги наверху).

### Message (Сообщение)

| Поле | Тип | Назначение |
|------|-----|------------|
| `conversation` | FK(Conversation) | |
| `sender` | FK(User) | Кто отправил |
| `is_admin` | BooleanField | true = сообщение от админа |
| `text` | TextField(5000) | Текст (пустой допустим для attachment-only) |
| `edited_at` | DateTimeField, null | Время последнего редактирования |
| `is_deleted` | BooleanField | Soft delete (текст очищается, сообщение скрывается) |
| `created_at` | auto_now_add | |

### Attachment (Вложение)

| Поле | Тип | Назначение |
|------|-----|------------|
| `message` | FK(Message) | |
| `file_key` | CharField(500) | S3 ключ (финальный, после resize) |
| `file_name` | CharField(255) | Оригинальное имя файла |
| `file_size` | PositiveIntegerField | Размер в байтах |
| `content_type` | CharField(100) | MIME тип |
| `is_expired` | BooleanField | Файл удалён (90 дней) |
| `created_at` | auto_now_add | |

### FeedbackReward (Награда)

| Поле | Тип | Назначение |
|------|-----|------------|
| `conversation` | FK(Conversation) | |
| `amount` | DecimalField | Сумма в Кадрах |
| `comment` | CharField(200) | Комментарий админа |
| `transaction` | FK(CreditsTransaction), null | Связь с транзакцией (SET_NULL) |
| `granted_by` | FK(User) | Кто начислил |
| `created_at` | auto_now_add | |

---

## API endpoints

### User (JWT auth)

| Метод | URL | Назначение |
|-------|-----|------------|
| GET/POST | `/api/feedback/conversation/` | Получить/создать свой диалог |
| GET/POST | `/api/feedback/messages/` | Список сообщений / отправить |
| POST | `/api/feedback/messages/{id}/presign/` | Presigned URL для загрузки в S3 |
| POST | `/api/feedback/messages/{id}/confirm-attach/` | Подтвердить загрузку |
| POST | `/api/feedback/conversation/read/` | Отметить прочитанным |

### Admin (JWT + Session auth, is_staff)

| Метод | URL | Назначение |
|-------|-----|------------|
| GET | `/api/feedback/admin/conversations/` | Список диалогов (фильтры: status, tag, search) |
| GET/PATCH | `/api/feedback/admin/conversations/{id}/` | Детали / обновить status, tag |
| GET/POST | `/api/feedback/admin/conversations/{id}/messages/` | Сообщения / ответ админа |
| POST | `/api/feedback/admin/conversations/{id}/reward/` | Начислить Кадры |
| POST | `/api/feedback/admin/conversations/{id}/read/` | Отметить прочитанным |
| PATCH/DELETE | `/api/feedback/admin/messages/{id}/` | Редактировать / удалить (soft) |
| GET | `/api/feedback/admin/unread-total/` | Общее количество непрочитанных |
| POST | `/api/feedback/admin/conversations/{id}/clear/` | Очистить историю (удалить сообщения + S3) |
| POST | `/api/feedback/admin/conversations/{id}/clear-attachments/` | Удалить вложения (оставить сообщения) |
| GET | `/api/feedback/admin/conversations/{id}/stats/` | Статистика: сообщений, вложений, объём |
| DELETE | `/api/feedback/admin/conversations/{id}/delete/` | Удалить диалог целиком (cascade + S3) |
| POST | `/api/feedback/admin/bulk/` | Массовые действия (resolve_all_open, close_old_resolved) |
| POST | `/api/feedback/admin/merge/` | Объединить два диалога одного пользователя |
| GET | `/api/feedback/conversations/` | Список всех диалогов пользователя (история) |

### Presign endpoints для staff

Endpoints `presign` и `confirm-attach` также доступны для staff (is_staff → доступ к любому сообщению). Используются для отправки вложений из админки.

---

## WebSocket

### Consumer: `FeedbackChatConsumer`

Маршрут: `ws/feedback/{conversation_id}/`

Аутентификация:
- JWT token в query string (`?token=...`) — для frontend
- Django session cookie (`sessionid`) — для Django admin

Группа: `feedback_{conversation_id}`

### Events (server → client)

| Тип | Данные | Когда |
|-----|--------|-------|
| `new_message` | `{message: {...}}` | Новое сообщение |
| `attachment_ready` | `{message_id, attachment: {...}}` | Вложение обработано Celery |
| `conversation_updated` | `{status, tag}` | Изменён статус/тег |
| `reward_granted` | `{message: {...}}` | Начислены Кадры (системное сообщение) |
| `message_edited` | `{message: {...}}` | Сообщение отредактировано |
| `message_deleted` | `{message_id}` | Сообщение удалено |
| `typing` | `{sender_name, is_admin}` | Индикатор набора текста |

### Events (client → server)

| Тип | Данные | Когда |
|-----|--------|-------|
| `typing` | `{type: "typing"}` | Админ печатает |

---

## Celery tasks

| Задача | Периодичность | Назначение |
|--------|--------------|------------|
| `process_feedback_attachment` | По событию | Resize изображений (800px), upload в S3 |
| `cleanup_feedback_tmp` | Каждый час | Удаление temp файлов из `feedback/tmp/` |
| `cleanup_old_attachments` | Каждые 12 часов | Пометка вложений старше 90 дней как expired |

---

## Архитектура

### Зависимости

| Зависимость | Тип связки | Как |
|---|---|---|
| **Credits** | Через адаптер | `CreditsAdapter` в `adapters.py` изолирует от `CreditsService` |
| **Notifications** | Вызов функции | `create_notification()` с примитивами, без импорта моделей |
| **S3** | Через общий клиент | `apps.common.s3.get_s3_client()` — единый для всех приложений |
| **User** | FK стандартный | `settings.AUTH_USER_MODEL` |

### Обратные зависимости

**Ноль.** Ни одно другое приложение не импортирует из feedback.

### Файловая структура

```
backend/apps/feedback/
├── adapters.py        → CreditsAdapter (изоляция от credits)
├── admin.py           → ConversationAdmin, inbox_view
├── consumers.py       → FeedbackChatConsumer (WebSocket)
├── models.py          → Conversation, Message, Attachment, FeedbackReward
├── routing.py         → ws/feedback/{id}/
├── serializers.py     → Message, Conversation, Admin serializers
├── services.py        → grant_reward, notify_*, WS broadcasts
├── tasks.py           → Celery: process_attachment, cleanup
├── urls.py            → /api/feedback/...
├── utils.py           → re-export S3 client
├── views.py           → REST API views
├── tests.py           → 40 unit tests
├── templates/admin/feedback/
│   ├── inbox.html     → Telegram-style чат (Django admin)
│   └── app_index.html → Кнопка «Чат с клиентами» на /admin/feedback/
```

```
frontend/
├── components/feedback/
│   ├── ChatInput.tsx          → Shared: auto-grow, paste, attach, send
│   ├── ChatMessageList.tsx    → Shared: grouping, date pills, scroll, jump-to-bottom
│   ├── MessageBubble.tsx      → Адаптивная раскладка, position-based radius
│   ├── SystemMessage.tsx      → Системные сообщения (награды, статусы)
│   ├── AttachmentPreview.tsx  → Превью изображений/файлов
│   ├── FeedbackChat.tsx       → Полный чат в /cabinet/feedback
│   ├── FeedbackDropdown.tsx   → Попап из navbar
│   ├── FeedbackButton.tsx     → Pill кнопка «Чат поддержки» в navbar
│   ├── AdminChatPanel.tsx     → Правая панель в /cabinet/inbox
│   ├── AdminFeedbackInbox.tsx → Контейнер inbox
│   ├── ConversationList.tsx   → Список диалогов (sidebar)
│   └── RewardModal.tsx        → Модалка начисления Кадров
├── lib/
│   ├── api/feedback.ts        → REST API клиент
│   ├── api/feedback-ws.ts     → WebSocket manager
│   ├── store/feedback.ts      → Zustand store (user)
│   └── store/feedback-admin.ts → Zustand store (admin)
```

---

## UX паттерны

### Сообщения (Telegram-style)

- **Группировка**: последовательные сообщения от одного sender в пределах 5 минут = группа
- **Gap**: 2px внутри группы, 8px между группами
- **Border-radius**: 15px (внешние), 5px (стыковочные углы)
- **Аватарки**: нет (1-on-1 чат, различие цветом)
- **Имена**: нет
- **Цвета**: admin = `#2B5278`, user = `#182533`
- **Адаптивность**: wide (≥768px) = все слева, narrow = свои справа

### Ввод

- **Enter** отправляет, **Shift+Enter** — новая строка
- **Auto-grow**: поле растёт до max-height (120px), скролл невидимый
- **Ctrl+V**: вставка скриншотов из буфера
- **Paperclip**: выбор файлов (images + pdf, max 10MB)

### Scroll

- **Infinite scroll**: подгрузка 30 сообщений при скролле вверх
- **Smart auto-scroll**: только если пользователь у дна (< 150px)
- **Jump-to-bottom**: круглая кнопка с badge непрочитанных
- **Unread separator**: «Новые сообщения» по `last_read_at`

### Typing indicator

- Admin → User: «Поддержка печатает...» с анимацией
- Через WS, debounce 5 сек, автоскрытие 10 сек

### Редактирование (только админ)

- Без лимита по времени
- Метка «изм.» рядом с timestamp
- Real-time через WS `message_edited`

### Удаление (только админ)

- Soft delete: `is_deleted=True`, текст очищается
- Сообщение исчезает из выдачи (без placeholder)
- Real-time через WS `message_deleted`

---

## Загрузка файлов

### Flow

```
1. POST /messages/{id}/presign/ → {upload_url, file_key}
2. XHR PUT upload_url (browser → S3 напрямую)
3. POST /messages/{id}/confirm-attach/ → Celery task
4. Celery: download → resize 800px → re-upload → create Attachment
5. WS: attachment_ready → frontend обновляет сообщение
```

### Ограничения

- MIME: image/jpeg, image/png, image/webp, application/pdf
- Max размер: 10 MB
- Max вложений на сообщение: 5
- Хранение: 90 дней, потом `is_expired=True`
- S3 path: `feedback/{conversation_id}/{uuid}.{ext}`

---

## Django Admin интерфейс

### Inbox (`/admin/feedback/inbox/`)

Полноэкранный Telegram-style чат в Django admin. Vanilla HTML/CSS/JS (не React).

Фичи:
- Список диалогов с поиском и фильтрами
- Real-time через WebSocket (session auth)
- Infinite scroll
- Редактирование сообщений (inline)
- Начисление Кадров (модалка)
- Кнопки: Начислить / Решено / Тег
- Jump-to-bottom с badge

### Доступ

- `/admin/` → кнопка «Чат с клиентами» (custom index template)
- `/admin/feedback/` → кнопка «Открыть чат с клиентами»
- `/admin/feedback/inbox/` → сам чат

---

## Нагрузка на сервер

### Оптимизации

- **N+1 fix**: `AdminConversationListSerializer` использует DB annotations (`Subquery`, `Count`) вместо `SerializerMethodField` — 4 SQL запроса вместо 1000+
- **Polling минимизирован**: FeedbackButton — 1 запрос на mount (без интервала), admin inbox — 60 сек
- **WebSocket**: real-time доставка сообщений без polling
- **Session auth в WS**: `JWTAuthMiddleware` с fallback на Django session (для admin)

### Текущие интервалы

| Источник | Интервал | Условие |
|----------|----------|---------|
| FeedbackButton | Однократно при mount | Каждый залогиненный юзер |
| Admin React inbox | 60 сек | Только когда страница открыта |
| Admin Django inbox | 30 сек (fallback polling) | В дополнение к WS |

---

## Тесты

Файл: `backend/apps/feedback/tests.py` — **61 тестов**

| Класс | Тесты | Что покрывает |
|-------|-------|--------------|
| `TestConversationModel` | 2 | Модель, ordering |
| `TestUserAPI` | 6 | CRUD, mark read, pagination |
| `TestAdminAPI` | 8 | List, reply, status, tag, reward, delete, permissions |
| `TestAdvancedFeatures` | 15 | Edit, soft delete, pagination 30, serializer output, attachments |
| `TestAdapterAndIntegration` | 9 | CreditsAdapter, S3 client, presign, unread total |
| `TestAdminManagement` | 5 | Clear history, delete conv, clear attachments, stats, bulk actions |
| `TestConversationLifecycle` | 12 | Multi-conversation, closed status, merge, auto-close, can_reply |
| `TestAutoClose` | 4 | Celery auto-close resolved after 24h |

---

## Интеграции

### Credits

Через `CreditsAdapter` (файл `adapters.py`):
```python
CreditsAdapter.grant_reward(user, amount, metadata)
```
Внутри вызывает `CreditsService.topup()` с `reason='feedback_reward'`. FK на `CreditsTransaction` optional (SET_NULL).

### Notifications

Прямой вызов `create_notification()` с типами:
- `feedback_new` — новое обращение от юзера (→ всем staff)
- `feedback_reply` — ответ админа (→ юзеру)
- `feedback_reward` — начисление награды (→ юзеру)

### S3

Через `apps.common.s3.get_s3_client()` — единый S3 клиент для всего проекта.

---

## Известные ограничения

1. **Один диалог на юзера** — MVP ограничение. Для множественных: миграция OneToOne → FK
2. **S3 CORS** — presigned URL загрузка требует корректной CORS конфигурации на S3 bucket
3. **Typing indicator** — только admin → user. Через WS, не работает в Django admin (polling mode)
4. **Редактирование** — только для admin сообщений. Клиент не может редактировать
