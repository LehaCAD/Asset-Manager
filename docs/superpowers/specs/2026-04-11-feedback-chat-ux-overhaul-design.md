# Чат обратной связи — UX Overhaul Spec

> Дата: 2026-04-11
> Статус: Approved (post spec-review fixes)
> Предыдущая спецификация: `2026-04-09-feedback-chat-design.md` (MVP, реализован)

## Цель

Довести фичу фидбэк-чата до продакшн-уровня: Telegram-style сообщения, единообразие между всеми тремя точками чата, автоматический mark-as-read, clipboard paste, full-screen inbox.

## Scope

Преимущественно frontend. Минимальные backend-изменения: разрешить staff доступ к presign/confirm-attach endpoints, новый lightweight endpoint `unread-total`.

---

## 1. Адаптивная раскладка сообщений

### Правило

| Ширина экрана | Раскладка |
|---|---|
| `≥ 768px` (md) | Все сообщения **слева**, различаются цветом bubble |
| `< 768px` | Свои сообщения **справа**, чужие **слева** |

### Визуал

**Широкий экран (≥md):**
```
[user bubble — bg-[#182533]]        ← все слева
[user bubble — bg-[#182533]]
[admin bubble — bg-[#2B5278]]       ← различие только цветом
```

**Узкий экран (<md):**
```
[admin bubble — bg-[#2B5278]]       ← слева
                [user bubble — bg-[#182533]]  ← справа
```

### Реализация

В `MessageBubble` добавить prop `isOwn` и media query через Tailwind:
- `md:items-start` (всегда слева на wide)
- На `<md`: `isOwn ? items-end : items-start`

Аватарки и имена отправителя убрать полностью — это 1-on-1 чат, цвет bubble достаточен для различения.

---

## 2. Группировка сообщений (Telegram-style)

### Правила группировки

- Последовательные сообщения от одного sender в пределах **5 минут** = одна группа
- Системные сообщения (`[SYS]`, `⚡`) разрывают группу

### Spacing

| Контекст | Gap |
|---|---|
| Между сообщениями в группе | `2px` (gap-0.5) |
| Между группами | `8px` (gap-2) |
| Вокруг date separator | `6px` сверху и снизу |

### Border-radius (как в Telegram)

Параметры: `big = 15px` (0.9375rem), `small = 5px` (0.3125rem).

На **широком** экране (все слева):
- Одиночное сообщение: все углы big
- Первое в группе: все big, кроме нижнего левого = small
- Среднее: левые углы small, правые big
- Последнее: все big, кроме верхнего левого = small

На **узком** экране для «своих» (справа):
- Первое: все big, кроме нижнего правого = small
- Среднее: правые small, левые big
- Последнее: все big, кроме верхнего правого = small

---

## 3. Разделители дат — таблетка

Заменить текущие `——— дата ———` на Telegram-style pill:

```tsx
<div className="flex justify-center py-1.5">
  <span className="bg-[#213040]/80 text-white/80 text-[11px] font-medium rounded-full px-3 py-0.5">
    {label}
  </span>
</div>
```

Относительные даты:
- Сегодня → «Сегодня»
- Вчера → «Вчера»
- Этот год → «10 апреля»
- Другой год → «10 апреля 2025»

---

## 4. Shared компоненты

### 4.1 `ChatMessageList`

Новый компонент, заменяет дублирование рендеринга в 3 местах.

```tsx
interface ChatMessageListProps {
  messages: FeedbackMessage[]
  isOwnMessage: (msg: FeedbackMessage) => boolean  // user: !msg.is_admin, admin: msg.is_admin
}
```

Вся логика группировки, date separators, system messages, gap-management — в одном месте.

Используется в:
- `FeedbackChat` (кабинет пользователя) — `isOwnMessage = (m) => !m.is_admin`
- `FeedbackDropdown` (попап) — `isOwnMessage = (m) => !m.is_admin`
- `AdminChatPanel` — `isOwnMessage = (m) => m.is_admin`

**Ограничение MVP:** при нескольких админах все admin-сообщения выглядят как «свои» для любого админа. Допустимо — в MVP один админ. При масштабировании добавить `sender_id` в `FeedbackMessage`.

### 4.2 `ChatInput`

Единый компонент ввода.

```tsx
interface ChatInputProps {
  onSend: (text: string) => Promise<void>
  onAttachment?: (file: File) => Promise<void>
  placeholder?: string
  showAttachButton?: boolean
}
```

Возможности:
- **Enter** отправляет, **Shift+Enter** — новая строка
- **Auto-growing textarea**: `onInput` handler, `textarea.style.height = 'auto'; textarea.style.height = textarea.scrollHeight + 'px'`. Min `h-9` (36px), max `max-h-[120px]`. Без внешних библиотек.
- **Clipboard paste** (Ctrl+V): перехват `onPaste`, извлечение `clipboardData.files` для изображений. На мобильных — работает через стандартный file picker (камера / галерея)
- Кнопка Paperclip + скрытый file input (`accept="image/jpeg,image/png,image/webp,application/pdf,image/*"` — `image/*` для мобильной камеры)
- Кнопка Send справа, `items-end` (прижата к низу)
- **Начальная высота**: input и кнопка Send строго одинаковые — `h-9` (36px)
- Подсказка под полем ввода убирается — стандартное поведение Enter, не нужно объяснять

Используется во всех 3 местах. В FeedbackDropdown: `showAttachButton = true` (теперь тоже поддерживает вложения).

### 4.3 `MessageBubble` v2

Обновлённый компонент:

```tsx
interface MessageBubbleProps {
  message: FeedbackMessage
  isOwn: boolean
  position: 'single' | 'first' | 'middle' | 'last'
}
```

- Нет аватарок
- Нет имён отправителя
- Адаптивная раскладка (п.1)
- Группировочные border-radius (п.2)
- Timestamp внутри bubble `text-[10px]`, справа

---

## 5. FeedbackDropdown — обновление

### Заголовок

`«Связаться с нами»` → `«Чат поддержки»`

### Размеры

- Ширина: `w-80` → `w-[360px]`
- Max-height сообщений: `max-h-[300px]` → `max-h-[360px]`

### Вложения

Добавить поддержку через ChatInput:
- Clipboard paste (Ctrl+V)
- Кнопка Paperclip для выбора файла

Остальное без изменений (последние 5 сообщений, ссылка на полную переписку).

---

## 6. FeedbackChat (/cabinet/feedback) — обновление

### Full-height layout

В `cabinet/layout.tsx` добавить `/cabinet/feedback` в условие full-height (как `/cabinet/inbox`):
```tsx
const isFullHeight = pathname === "/cabinet/inbox" || pathname === "/cabinet/feedback"
```

Убирает `max-w-5xl mx-auto p-8` и даёт `flex flex-col overflow-hidden`.

### Заголовок

Оставить `«Обратная связь»` + badge статуса — всё нормально.

### Вложения

Clipboard paste через ChatInput (уже есть Paperclip, добавляется paste).

---

## 7. AdminChatPanel — обновление

### Кнопки в шапке — единообразие

Все action-кнопки:
- Единый стиль: `variant="outline"`, `h-8`, `text-xs`, `gap-1.5`, `border-border/50`
- Единый hover: `hover:bg-muted/50`

| Кнопка | Иконка | Текст |
|---|---|---|
| Начислить | `<KadrIcon size="xs" />` | Начислить |
| Решено/Открыть | `<Check />` / `<RotateCcw />` | Решено / Открыть |
| Тег | `<Tag />` | Текущий тег или иконка |

### Input area

Заменить на ChatInput:
- Clipboard paste (Ctrl+V)
- Кнопка Paperclip (теперь админ тоже может отправлять файлы)
- Enter отправляет

### Вложения для админа

Сейчас админ не может отправлять файлы. Добавить:
- Используем те же API endpoints что и у user (`presign` → S3 upload → `confirm-attach`)
- Нужен небольшой backend-апдейт: endpoint `presign` и `confirm-attach` должны работать и для admin-отправленных сообщений

---

## 8. ConversationList — badge и layout

### Unread badge — Telegram-style

Текущее: badge внизу после тега, 16px, по центру.

Новое:
- Позиция: **справа на уровне последнего сообщения** (вторая строка, opposite end)
- Размер: `min-w-[20px] h-5 text-[11px] rounded-full` — pill
- Цвет: `bg-primary text-primary-foreground`
- >99: показывать `99+`

Layout строки:
```
[Avatar 32px] [Name ··················· Time]
              [Preview ················ (badge)]
```

Tag badge переместить из третьей строки на уровень имени (inline, после Name).

### Auto-select первого диалога

Логика живёт в store `feedback-admin.ts`, в action `loadConversations`:
```tsx
// После загрузки conversations
if (convs.length > 0 && !get().activeConversation) {
  get().selectConversation(convs[0].id)
}
```
Один владелец логики — store, не компоненты.

---

## 9. Auto mark-as-read (scroll-based)

### Сторона админа

1. **При открытии диалога** — `adminMarkRead(id)` — уже работает
2. **При получении нового сообщения через WS, если диалог открыт** — немедленно `adminMarkRead(id)` + очистить badge в conversations list
3. Badge очищается мгновенно через local state, API-запрос mark-as-read идёт async

### Сторона пользователя

1. **При открытии чата** — `markAsRead()` — уже работает
2. **При получении нового сообщения через WS, если чат открыт** — `markAsRead()` + `hasUnreadReply = false`
3. Зелёная точка на FeedbackButton пропадает мгновенно

### Обновление badge для inactive conversations

WS подключен только к activeConversation. Для обновления badge на неактивных диалогах:
- **Polling**: `loadConversations()` каждые 30 секунд (lightweight — список с unread_by_admin уже возвращается API)
- Локальный инкремент `unread_by_admin` для activeConversation при WS new_message уже реализован
- Polling обеспечивает catch-up для сообщений в других диалогах

Отдельный WS endpoint для всех conversations — overkill для MVP с одним админом.

---

## 10. Admin navigation

### Проблема

Нет понятной кнопки для перехода в inbox. Пункт «Входящие» скрыт в разделе «Администрирование» сайдбара кабинета, виден только для is_staff.

### Решение

Переименовать пункт в навигации:
- `«Входящие»` → `«Обратная связь (админ)»` — нет, это длинно
- Лучше: оставить `«Входящие»` но добавить badge с количеством непрочитанных обращений

Также: пункт «Обратная связь» (MessageCircle) для обычных пользователей уже есть. Для is_staff — пункт «Входящие» (Inbox icon) уже есть в секции «Администрирование». Кнопка на месте, но нужно сделать её заметнее:

- Добавить **unread count badge** рядом с текстом «Входящие» в сайдбаре — красный/primary dot или число
- Это требует API-запрос для общего количества непрочитанных обращений при загрузке layout

---

## 11. Full-screen inbox layout

### Текущее состояние

Layout уже обрабатывает `/cabinet/inbox` как full-height (`flex flex-col overflow-hidden`). Но:
- Когда нет выбранного диалога, показывается маленький текст «Выберите диалог» по центру
- Первый диалог не выбирается автоматически

### Решение

1. **Auto-select**: при загрузке, если есть conversations → `selectConversation(conversations[0].id)`
2. **Empty state**: если нет ни одного обращения → красивый empty state на весь экран: «Нет обращений. Пользователи ещё не написали.»
3. Layout уже full-height — дополнительных изменений не нужно

---

## 12. Backend — минимальные изменения

### Admin attachments

Для того чтобы админ мог отправлять файлы, нужно:
- Endpoint `POST /api/feedback/admin/conversations/{id}/messages/{msg_id}/presign/` — новый
- Endpoint `POST /api/feedback/admin/conversations/{id}/messages/{msg_id}/confirm-attach/` — новый
- Или: переиспользовать существующие user endpoints, добавив проверку `is_staff → can access any conversation`

Проще второе: в существующих `presign` и `confirm-attach` views изменить фильтр:

```python
# Было:
msg = Message.objects.filter(id=message_id, conversation__user=request.user, is_admin=False).first()

# Стало:
if request.user.is_staff:
    msg = Message.objects.filter(id=message_id).first()
else:
    msg = Message.objects.filter(id=message_id, conversation__user=request.user, is_admin=False).first()
```

Staff получает доступ к любому сообщению (и своему `is_admin=True`, и чужому).

### Unread count API для sidebar badge

Новый lightweight endpoint:
```
GET /api/feedback/admin/unread-total/ → { unread_total: number }
```
Возвращает суммарное количество непрочитанных обращений для отображения badge в сайдбаре.

Стратегия кэширования:
- Fetch на mount layout-а, хранить в `feedback-admin` store
- Обновлять реактивно: при polling `loadConversations` пересчитывать из полученных данных
- Нет отдельного polling — считается из результатов loadConversations (sum of unread_by_admin)

---

## 13. Файлы для изменения

### Изменяемые файлы (frontend)

| Файл | Что менять |
|---|---|
| `components/feedback/MessageBubble.tsx` | Полная переработка: адаптивная раскладка, убрать аватарки/имена, position-based radius |
| `components/feedback/FeedbackChat.tsx` | Использовать ChatMessageList + ChatInput, убрать дублирование |
| `components/feedback/FeedbackDropdown.tsx` | Заголовок, размеры, ChatMessageList + ChatInput |
| `components/feedback/AdminChatPanel.tsx` | Кнопки, ChatInput, вложения |
| `components/feedback/ConversationList.tsx` | Badge position, tag position, auto-select |
| `components/feedback/AdminFeedbackInbox.tsx` | Auto-select первого диалога |
| `components/feedback/SystemMessage.tsx` | Без изменений |
| `components/feedback/AttachmentPreview.tsx` | Без изменений |
| `components/feedback/RewardModal.tsx` | Без изменений |
| `lib/store/feedback.ts` | Auto mark-as-read при WS-получении |
| `lib/store/feedback-admin.ts` | Auto mark-as-read при WS, auto-select |
| `app/(cabinet)/cabinet/layout.tsx` | Full-height для /feedback, unread badge в nav |
| `components/feedback/FeedbackButton.tsx` | Текст pill: «Связаться с нами» → «Чат поддержки», ширина PopoverContent → `w-[360px]` |

### Новые файлы (frontend)

| Файл | Описание |
|---|---|
| `components/feedback/ChatMessageList.tsx` | Shared компонент рендеринга списка сообщений |
| `components/feedback/ChatInput.tsx` | Shared компонент ввода с paste + attach |

### Backend

| Файл | Что менять |
|---|---|
| `apps/feedback/views.py` | Разрешить staff доступ к presign/confirm-attach; новый unread-total endpoint |
| `apps/feedback/urls.py` | Новый URL для unread-total |

---

## 14. Что НЕ входит в scope

- Голосовые сообщения
- Email-уведомления
- Множественные диалоги
- Шаблоны ответов
- Sticky date separator на scroll
- Приоритеты обращений
- Read receipts (галочки прочитано)
