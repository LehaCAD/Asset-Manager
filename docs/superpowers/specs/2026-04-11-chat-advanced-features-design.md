# Продвинутые фичи чата — Design Spec

> Дата: 2026-04-11
> Статус: Approved

## Цель

Довести чат до индустриального стандарта: пагинация при скролле, умный auto-scroll, typing indicator, разделитель непрочитанных, редактирование админом, soft delete.

## Scope

8 фич. Backend + Frontend (React + Django template inbox.html).

---

## 1. Infinite scroll — подгрузка старых сообщений

### Backend
- Изменить `PAGE_SIZE` с 50 на 30 в обоих endpoints (user + admin messages)
- Cursor-based пагинация уже работает (`?cursor=<message_id>`)

### Frontend (ChatMessageList)
- `IntersectionObserver` на элемент-сентинель вверху списка
- Когда виден → вызвать `loadMessages(oldestMessage.id)`
- Показать спиннер пока грузится
- После подгрузки — сохранить позицию скролла (запомнить scrollHeight до, восстановить после)
- Если вернулось 0 сообщений — убрать сентинель (всё загружено)

### Django admin (inbox.html)
- Добавить scroll listener на `#chat-messages`
- При scrollTop < 50px → загрузить ещё 30 (cursor = oldest message id)
- Prepend к messages array, re-render с сохранением позиции

---

## 2. Кнопка «Вниз» с badge

### Визуал
- Круглая кнопка 40px, position absolute, bottom-right чата (right: 16px, bottom: 16px)
- Иконка ChevronDown (lucide)
- Badge: количество новых сообщений пришедших через WS пока скроллил вверх
- Появляется при scrollDistance > 300px от дна
- Клик → smoothScroll to bottom + сбросить badge

### Реализация
- Новый state: `newMessageCount` в store (инкрементируется при WS message если !isNearBottom)
- `isNearBottom` — scrollHeight - scrollTop - clientHeight < 150px

---

## 3. Умный auto-scroll

### Правило
- `isNearBottom` = true → auto-scroll при новом сообщении
- `isNearBottom` = false → НЕ скроллить, инкрементировать newMessageCount

### Удалить текущий безусловный auto-scroll
- В ChatMessageList убрать `useEffect` который скроллит на каждый `[messages]` change
- Заменить на scroll только при `isNearBottom` или при первой загрузке

---

## 4. Typing indicator (admin → user)

### Backend
- Новый WS event type: `typing` в FeedbackChatConsumer
- Consumer пробрасывает `{type: "typing", sender_name: str, is_admin: bool}` в группу
- Без записи в БД — чисто транзитный

### Frontend (клиентский чат)
- При получении `{type: "typing", is_admin: true}` → показать «Поддержка печатает...»
- Анимация трёх точек (CSS)
- Автоскрытие через 10 секунд
- Позиция: внизу списка сообщений, перед input area

### Admin → отправка typing
- В admin store: при вводе текста → WS send `{type: "typing"}` debounced каждые 5 секунд
- В inbox.html: аналогично через WebSocket (если подключён) или просто не показывать (polling mode)

---

## 5. Разделитель «Новые сообщения»

### Логика
- При загрузке сообщений: найти первое сообщение с `created_at > last_read_at`
- Вставить перед ним визуальный разделитель: `───── Новые сообщения ─────`
- Скроллить к этому разделителю, не к самому низу
- Если все сообщения прочитаны — скроллить к низу как обычно

### Backend
- Для user: `conversation.user_last_read_at` (уже есть)
- Для admin: `conversation.admin_last_read_at` (уже есть)
- Добавить `last_read_at` в ответ API: `ConversationSerializer` → добавить поле `user_last_read_at`
- `AdminConversationListSerializer` → уже содержит `admin_last_read_at` неявно (через unread_by_admin)

### Frontend
- Передать `lastReadAt` в ChatMessageList
- В рендеринге: если `msg.created_at > lastReadAt && prevMsg.created_at <= lastReadAt` → вставить разделитель
- Ref на разделитель → scrollIntoView при первой загрузке

---

## 6. Редактирование сообщений (только админ)

### Backend
- Новое поле: `Message.edited_at = DateTimeField(null=True, blank=True)`
- Миграция: добавить `edited_at`
- Новый endpoint: `PATCH /api/feedback/admin/messages/{id}/` → обновить `text`, установить `edited_at=now()`
- Только `is_admin=True` сообщения, только staff
- WS событие: `message_edited` → `{type: "message_edited", message: MessageSerializer.data}`
- MessageSerializer: добавить `edited_at` в fields

### Frontend
- При получении WS `message_edited` → обновить сообщение в messages array
- Показать «изм.» рядом с timestamp если `edited_at` не null
- Админ: кнопка «Редактировать» в контекстном меню сообщения (hover → карандаш)
- UI редактирования: заменить input area на edit mode с текстом сообщения

### Django admin (inbox.html)
- Клик на своё сообщение → edit mode
- Сохранение через `PATCH /api/feedback/admin/messages/{id}/`
- Обновление через polling (5s)

---

## 7. Soft delete

### Backend
- Новое поле: `Message.is_deleted = BooleanField(default=False)`
- Миграция: добавить `is_deleted`
- Изменить `admin_delete_message`: вместо `Message.objects.filter(id=message_id).delete()` → `update(is_deleted=True, text="")`
- WS событие: `message_deleted` → `{type: "message_deleted", message_id: int}`
- MessageSerializer: если `is_deleted` → не возвращать text/attachments

### Frontend
- При получении WS `message_deleted` → удалить сообщение из массива (просто исчезает)
- Сериализатор на бэкенде не включает удалённые в выдачу
- Без placeholder — удалённые сообщения просто пропадают

---

## 8. Backend миграция (одна)

```python
# 0005_message_edited_deleted.py
operations = [
    migrations.AddField('Message', 'edited_at', DateTimeField(null=True, blank=True)),
    migrations.AddField('Message', 'is_deleted', BooleanField(default=False)),
]
```

Обратно совместимая — nullable поля, default значения.

---

## Что НЕ делаем

- Очистка истории
- Реакции
- Read receipts
- Reply/quote
- Поиск
- Редактирование клиентом
- Placeholder «Сообщение удалено» — удалённые просто исчезают
