## UX Analysis: Редизайн чата обратной связи
### Размер: L

---

### 1. Текущее состояние

**FeedbackChat (пользовательский вид, /cabinet/feedback)**
- Плохая визуальная иерархия: аватары, никнеймы и bubble-цвета почти неразличимы
- `own message` (#primary/20) vs `other message` (bg-muted) — контраст слишком слабый
- Textarea без `text-foreground` → чёрный текст на тёмном фоне (уже исправлено)
- Нет разделителя дат
- Нет условной видимости аватаров (показываются всегда, занимают место)
- Клавиша Enter непоследовательна между FeedbackChat (Ctrl+Enter) и FeedbackDropdown (Enter)

**AdminChatPanel (вид в /cabinet/inbox)**
- Те же проблемы с bubble-цветами (admin "own" ≠ user "own" — логика инвертирована)
- Кнопки действий (Начислить / Решено / Тег) не сгруппированы, мелкие
- Нет индикатора загрузки при смене диалога
- Нет разделителя дат в admin-чате

**ConversationList (левая колонка)**
- Жёсткая ширина `w-[280px]` — неадаптивно
- Поиск с утечкой таймеров (уже исправлено)
- Нет скелетона при загрузке

---

### 2. Impact Map

| Компонент | Затронут редизайном | Критичность |
|---|---|---|
| MessageBubble | Ядро — изменяется полностью | КРИТИЧНА |
| FeedbackChat | Все элементы layout | КРИТИЧНА |
| AdminChatPanel | Header, сообщения, input | КРИТИЧНА |
| FeedbackDropdown | Наследует MessageBubble | ВЫСОКАЯ |
| ConversationList | Элементы списка, sidebar | ВЫСОКАЯ |
| AttachmentPreview | Вложен в MessageBubble | СРЕДНЯЯ |
| SystemMessage | Небольшой, изолирован | НИЗКАЯ |

---

### 3. Решение (принятые решения)

**Палитра (из Color System v2, pen/pencil-new.pen):**
- Фон чата: `#0F172A` (bg-base)
- Bubble — своё сообщение: `#1A2744` (тёмно-синий, отличается от slate)
- Bubble — чужое сообщение: `#1E293B` (bg-surface)
- Текст в bubble: `#F8FAFC` (text-primary)
- Timestamp: `#64748B` (text-muted)
- Акцент: `#8B7CF7` (accent-primary — кнопка Send, badge открыт)
- Border/divider: `#1E293B`

**MessageBubble — новая структура:**
- Telegram-style: аватар условно (только при смене отправителя)
- cornerRadius: `[12,12,2,12]` для своих (правый нижний обрезан), `[2,12,12,12]` для чужих (левый верхний)
- Timestamp внутри bubble, right-aligned, 10px, `#64748B`
- Sender name убран из bubble (показывается в header admin-панели)

**Input bar:**
- Три элемента: [Paperclip] [Textarea] [Send button]
- Textarea: `#1E293B` фон, `text-foreground`, cornerRadius 8px
- Send button: `#8B7CF7` фон, иконка send, 36×36px
- Hint: "Ctrl+Enter — отправить" (унифицировано)

**Разделитель дат:**
- Горизонтальная линия `#1E293B` + текст "Сегодня"/"Вчера" по центру

**System message:**
- Горизонтальная линия + pill-badge с `bg-surface` фоном, text-muted цветом

**Admin panel header:**
- Avatar (36px ellipse) + username + email + balance
- Action buttons: [Начислить (outline)] [Решено/Открыть (filled)] + Tag badge

**ConversationList:**
- Active item: `#14213D` фон + левая граница 2px `#8B7CF730`
- Unread badge: purple circle

---

### 4. Развилки

#### Развилка A: Timestamp позиция
- **A (рекомендуется):** Внутри bubble, right-aligned bottom (Telegram-стиль) — компактнее, всегда видно
- **B:** Снаружу bubble, под ним отдельной строкой — больше места, явнее

#### Развилка B: Видимость аватаров
- **A (рекомендуется):** Условно — только при смене отправителя (Telegram-стиль) — экономит ~30-40% вертикали
- **B:** Всегда — проще в реализации, больше контекста

#### Развилка C: Enter в FeedbackDropdown
- **A (рекомендуется):** Ctrl+Enter везде (унификация с FeedbackChat) — ожидаемо для продвинутых пользователей
- **B:** Enter в dropdown (как сейчас) — быстрее для кратких ответов, нельзя multiline

---

### 5. Scope для имплементации

**Файлы для изменения:**
1. `frontend/components/feedback/MessageBubble.tsx` — cornerRadius, цвета, conditional avatar, timestamp inside bubble
2. `frontend/components/feedback/FeedbackChat.tsx` — разделитель дат, input bar дизайн
3. `frontend/components/feedback/AdminChatPanel.tsx` — header redesign, input bar
4. `frontend/components/feedback/AttachmentPreview.tsx` — max-width увеличить до 260px
5. `frontend/components/feedback/SystemMessage.tsx` — добавить горизонтальные линии
6. `frontend/components/feedback/ConversationList.tsx` — sidebar styling, active state

**Порядок работы:**
1. MessageBubble (ядро — все используют)
2. SystemMessage
3. FeedbackChat layout + input
4. AdminChatPanel header + input
5. ConversationList items
6. AttachmentPreview

**Edge cases:**
- Empty: нет сообщений → placeholder "Нашли баг? Есть идея? Напишите — мы читаем каждое сообщение."
- Loading: skeleton bubbles
- Resolved conversation: subtle visual indicator + disabled state на input
- Long sender name: truncate с ellipsis
- Admin без тега: badge не показывать
- Attachments без URL: expired state (уже работает)

**Mockup:** node `shlug` в `pen/pencil-new.pen`
