# Обратная связь (Feedback)

> Актуальное состояние подсистемы. Обновлять при внесении изменений.
> Последнее обновление: 2026-04-13

---

## Назначение

Чат поддержки между пользователем и администратором. Один пользователь может иметь несколько диалогов (ForeignKey). Real-time через WebSocket, с поддержкой вложений, наград, тегов, редактирования и управления диалогами.

## Приложение

`backend/apps/feedback/`

## Жизненный цикл диалога

```
[Клиент пишет] → Conversation(open) создаётся
     ↓
[Админ закрывает] → Нажимает «Закрыть» → status=closed
     ↓  (или 24ч без сообщений → Celery auto_close_inactive → status=closed)
[Клиент пишет снова] → Создаётся НОВЫЙ Conversation(open)
     ↓
Клиент видит pill «Новое обращение» между диалогами в unified stream
```

| Статус | Для клиента | Для админа |
|--------|-------------|------------|
| `open` | Может писать, видит чат | Активный, в списке |
| `closed` | Видит историю, не может писать. Новое сообщение → новый диалог | Серым в списке, можно merge |

**Merge диалогов:** Админ может объединить два диалога одного пользователя через dropdown-меню (⋮ → Объединить). Все сообщения переносятся в целевой диалог, исходный удаляется.

**Unified message stream:** Клиент видит ВСЕ свои сообщения из всех диалогов единым потоком через `/api/feedback/all-messages/`. Граница между диалогами отмечается pill «Новое обращение» (детектируется по `conversation_id`).

---

## Модели

### Conversation (Диалог)

Файл: `backend/apps/feedback/models.py`

| Поле | Тип | Назначение |
|------|-----|------------|
| `user` | ForeignKey(User) | Владелец диалога (1 юзер = много диалогов) |
| `status` | CharField | `open` / `closed` |
| `tag` | CharField | `bug` / `question` / `idea` / пусто |
| `user_last_read_at` | DateTimeField, null | Когда юзер последний раз прочитал чат |
| `admin_last_read_at` | DateTimeField, null | Когда админ последний раз прочитал чат |
| `created_at` | auto_now_add | |
| `updated_at` | auto_now | Обновляется при каждом новом сообщении |

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
| `comment` | CharField(200) | Комментарий админа (необязательный) |
| `transaction` | FK(CreditsTransaction), null | Связь с транзакцией (SET_NULL) |
| `granted_by` | FK(User) | Кто начислил |
| `created_at` | auto_now_add | |

---

## API endpoints

### User (JWT auth)

| Метод | URL | Назначение |
|-------|-----|------------|
| GET/POST | `/api/feedback/conversation/` | Получить активный / создать новый диалог |
| GET | `/api/feedback/conversations/` | Список всех диалогов пользователя (история) |
| GET/POST | `/api/feedback/messages/` | Сообщения текущего диалога / отправить |
| GET | `/api/feedback/all-messages/` | Unified stream: ВСЕ сообщения всех диалогов с `conversation_id` |
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
| POST | `/api/feedback/admin/bulk/` | Массовые действия (close_all_open, close_old_inactive) |
| POST | `/api/feedback/admin/merge/` | Объединить два диалога одного пользователя |

### Presign endpoints для staff

Endpoints `presign` и `confirm-attach` также доступны для staff (is_staff → доступ к любому сообщению).

---

## WebSocket

### Consumer: `FeedbackChatConsumer`

Маршрут: `ws/feedback/{conversation_id}/`

Аутентификация:
- JWT token в query string (`?token=...`) — для frontend
- Django session cookie (`sessionid`) — для Django admin

### Consumer: `AdminFeedbackConsumer`

Маршрут: `ws/feedback/admin/`

Аутентификация: Django session cookie (is_staff required). Получает события из ВСЕХ диалогов для мгновенного обновления списка.

### Events (server → client)

| Тип | Данные | Когда |
|-----|--------|-------|
| `new_message` | `{message: {...}}` | Новое сообщение |
| `attachment_ready` | `{message_id, attachment: {...}}` | Вложение обработано Celery |
| `conversation_updated` | `{status, tag}` | Изменён статус/тег |
| `reward_granted` | `{message: {...}}` | Начислены Кадры |
| `message_edited` | `{message: {...}}` | Сообщение отредактировано |
| `message_deleted` | `{message_id}` | Сообщение удалено |
| `typing` | `{sender_name, is_admin}` | Индикатор набора текста |
| `feedback_list_update` | `{conversation_id, ...}` | Обновление списка (admin-wide WS) |

---

## Celery tasks

| Задача | Периодичность | Назначение |
|--------|--------------|------------|
| `process_feedback_attachment` | По событию | Resize изображений (800px), upload в S3 |
| `cleanup_feedback_tmp` | Каждый час | Удаление temp файлов из `feedback/tmp/` |
| `cleanup_old_attachments` | Каждые 12 часов | Пометка вложений старше 90 дней как expired |
| `auto_close_inactive` | Каждый час | Закрытие open диалогов без активности 24ч |

---

## Архитектура

### Зависимости

| Зависимость | Тип связки | Как |
|---|---|---|
| **Credits** | Через адаптер | `CreditsAdapter` в `adapters.py` изолирует от `CreditsService` |
| **Notifications** | Вызов функции | `create_notification()` с примитивами |
| **S3** | Через общий клиент | `apps.common.s3.get_s3_client()` |
| **User** | FK стандартный | `settings.AUTH_USER_MODEL` |

### Обратные зависимости

**Ноль.** Ни одно другое приложение не импортирует из feedback.

### Файловая структура

```
backend/apps/feedback/
├── adapters.py        → CreditsAdapter
├── admin.py           → ConversationAdmin, inbox_view
├── consumers.py       → FeedbackChatConsumer, AdminFeedbackConsumer
├── models.py          → Conversation, Message, Attachment, FeedbackReward
├── routing.py         → ws/feedback/{id}/, ws/feedback/admin/
├── serializers.py     → Message, Conversation, Admin serializers
├── services.py        → grant_reward, notify_*, WS broadcasts
├── tasks.py           → Celery: process_attachment, cleanup, auto_close
├── urls.py            → /api/feedback/...
├── utils.py           → re-export S3 client
├── views.py           → REST API views (user + admin + management)
├── tests.py           → 68 unit tests
├── templates/admin/feedback/
│   ├── inbox.html     → Telegram-style чат с лайтбоксом (Django admin)
│   └── app_index.html → Кнопка «Чат с клиентами»
```

```
frontend/
├── components/feedback/
│   ├── ChatInput.tsx          → Shared: auto-grow, paste, staged preview, send
│   ├── ChatMessageList.tsx    → Shared: grouping, date pills, scroll, jump-to-bottom, conversation boundaries
│   ├── MessageBubble.tsx      → Адаптивная раскладка, position-based radius, «изм.» метка
│   ├── SystemMessage.tsx      → Системные сообщения
│   ├── AttachmentPreview.tsx  → Превью изображений/файлов (adaptive width)
│   ├── FeedbackChat.tsx       → Полный чат в /cabinet/feedback
│   ├── FeedbackDropdown.tsx   → Попап из navbar
│   ├── FeedbackButton.tsx     → Pill кнопка «Чат поддержки»
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
- **Границы обращений**: pill «Новое обращение» при смене `conversation_id`

### Ввод

- **Enter** отправляет, **Shift+Enter** — новая строка
- **Auto-grow**: поле растёт до 120px, скролл невидимый
- **Staged preview**: файлы не отправляются сразу, показываются как миниатюры 32x32 с крестиком
- **Ctrl+V**: вставка скриншотов → staged preview
- **Paperclip**: выбор файлов (images + pdf, max 10MB, max 5 файлов)
- **Подсказка**: счётчик `N/5` когда есть файлы

### Scroll

- **Infinite scroll**: подгрузка 30 сообщений при скролле вверх
- **Smart auto-scroll**: только если у дна (< 150px)
- **Jump-to-bottom**: круглая кнопка с badge непрочитанных
- **Сообщения снизу**: flex-spacer прижимает к нижнему краю

### Typing indicator

- Admin → User: «Поддержка печатает...» с анимацией
- Через WS, debounce 5 сек, автоскрытие 10 сек

### Редактирование (только админ, Telegram-style)

- Клик по своему сообщению → текст в поле ввода, плашка «Редактирование» сверху
- Enter сохраняет, Escape отменяет
- Метка «изм.» рядом с timestamp
- Real-time через WS

### Удаление (только админ)

- Soft delete, сообщение исчезает без placeholder
- Real-time через WS

### Награды

- Preset кнопки: 10 / 25 / 50 / 100 / Другая сумма
- Preset комментарии: За отзыв / За ошибку / За идею / За тестирование / Бонус
- Комментарий необязателен

### Лайтбокс (admin inbox)

- Клик по изображению → полноэкранный просмотр
- Стрелки ← → между всеми изображениями чата
- Клавиши: ArrowLeft/Right, Escape
- Счётчик `N / M`

---

## Управление диалогами (админ)

Меню ⋮ в шапке чата:

| Действие | Что делает |
|----------|-----------|
| 📊 Статистика | Сообщений, вложений, объём |
| 🗑 Очистить историю | Удалить все сообщения + S3, диалог остаётся |
| 📎 Удалить вложения | Удалить файлы, сообщения остаются |
| ❌ Удалить диалог | Каскадное удаление всего |
| 🔗 Объединить | Merge двух диалогов одного юзера |

Bulk-действия через API:
- `close_all_open` — закрыть все открытые
- `close_old_inactive` — удалить закрытые старше N дней

---

## Загрузка файлов

### Flow

```
1. Файл → staged preview (миниатюра 32x32 в ChatInput)
2. Enter/кнопка → POST /messages/ (создать сообщение)
3. POST /messages/{id}/presign/ → {upload_url, file_key}
4. XHR PUT upload_url (browser → S3)
5. POST /messages/{id}/confirm-attach/ → Celery task
6. Celery: download → resize 800px → upload → create Attachment
7. WS: attachment_ready
```

### Ограничения

- MIME: image/jpeg, image/png, image/webp, application/pdf
- Max размер: 10 MB
- Max вложений: 5 на сообщение
- Хранение: 90 дней, потом `is_expired=True`
- S3 path: `feedback/{conversation_id}/{uuid}.{ext}`
- S3 CORS: `AllowedHeaders: ["*"]`, origins: localhost:3000, raskadrawka.ru

---

## Нагрузка на сервер

### Оптимизации

- **N+1 fix**: `AdminConversationListSerializer` — DB annotations (`Subquery`, `Count`)
- **Admin-wide WS**: `AdminFeedbackConsumer` — мгновенное обновление списка без polling
- **FeedbackButton**: 1 запрос при mount, далее WS
- **Fallback polling**: 60 сек (admin Django inbox)

---

## Тесты

Файл: `backend/apps/feedback/tests.py` — **68 тестов**

| Класс | Тесты | Что покрывает |
|-------|-------|--------------|
| `TestConversationModel` | 4 | Модель, ordering, multi-conv, closed status |
| `TestUserAPI` | 12 | CRUD, mark read, history, closed→new conv, unified stream |
| `TestAdminAPI` | 8 | List, reply, status, tag, reward, delete, permissions |
| `TestAdvancedFeatures` | 15 | Edit, soft delete, pagination 30, serializer, attachments |
| `TestAdapterAndIntegration` | 9 | CreditsAdapter, S3 client, presign, unread total |
| `TestAdminManagement` | 5 | Clear history, delete conv, clear attachments, stats, bulk |
| `TestConversationLifecycle` | 8 | Merge, auto-close, can_reply, admin close |
| `TestUnifiedStream` | 7 | All-messages endpoint, pagination, isolation, boundaries |

---

## Интеграции

### Credits

Через `CreditsAdapter` (`adapters.py`). FK на `CreditsTransaction` optional (SET_NULL).

### Notifications

`create_notification()` с типами: `feedback_new`, `feedback_reply`, `feedback_reward`.

### S3

`apps.common.s3.get_s3_client()` — единый клиент.

---

## Известные ограничения

1. **S3 CORS** — требует `AllowedHeaders: ["*"]` на bucket
2. **Typing indicator** — только admin → user, не работает в Django admin template (только React)
3. **Редактирование** — только для admin сообщений
4. **Лайтбокс** — только в Django admin inbox, не в React
