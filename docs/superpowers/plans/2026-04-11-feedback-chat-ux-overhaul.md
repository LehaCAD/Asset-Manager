# Feedback Chat UX Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Довести фидбэк-чат до продакшн Telegram-уровня: адаптивная раскладка, единые shared-компоненты, clipboard paste, auto mark-as-read, full-screen inbox.

**Architecture:** Извлекаем ChatMessageList и ChatInput как shared-компоненты, переписываем MessageBubble с position-based border-radius. Все 3 точки чата (FeedbackChat, FeedbackDropdown, AdminChatPanel) используют одни и те же компоненты. Минимальный backend-апдейт для staff attachments.

**Tech Stack:** Next.js 14, React 19, Tailwind 4, Zustand 5, Django 5, DRF

**Spec:** `docs/superpowers/specs/2026-04-11-feedback-chat-ux-overhaul-design.md`

---

## File Structure

### New files
| File | Responsibility |
|---|---|
| `frontend/components/feedback/ChatInput.tsx` | Shared input: auto-grow textarea, Ctrl+V paste, Paperclip attach, Send button |
| `frontend/components/feedback/ChatMessageList.tsx` | Shared message list: grouping, date separators, system messages |

### Modified files
| File | Changes |
|---|---|
| `frontend/components/feedback/MessageBubble.tsx` | Full rewrite: adaptive layout, position-based radius, no avatars/names |
| `frontend/components/feedback/FeedbackChat.tsx` | Refactor to use ChatMessageList + ChatInput |
| `frontend/components/feedback/FeedbackDropdown.tsx` | Title, width, use shared components, add attachments |
| `frontend/components/feedback/FeedbackButton.tsx` | Pill text, PopoverContent width |
| `frontend/components/feedback/AdminChatPanel.tsx` | Button consistency, ChatInput, attachment support |
| `frontend/components/feedback/ConversationList.tsx` | Badge position, tag inline, auto-select |
| `frontend/lib/store/feedback.ts` | Auto mark-as-read on WS message |
| `frontend/lib/store/feedback-admin.ts` | Auto mark-as-read, auto-select, polling, totalUnread |
| `frontend/lib/api/feedback.ts` | Admin presign/confirm helpers |
| `frontend/app/(cabinet)/cabinet/layout.tsx` | Full-height for /feedback, unread badge |
| `backend/apps/feedback/views.py` | Staff access to presign/confirm, unread-total endpoint |
| `backend/apps/feedback/urls.py` | New URL for unread-total |
| `backend/apps/feedback/tests.py` | Tests for new staff access + unread-total |

---

## Task 1: Backend — Staff attachment access + unread-total

**Files:**
- Modify: `backend/apps/feedback/views.py`
- Modify: `backend/apps/feedback/urls.py`
- Modify: `backend/apps/feedback/tests.py`

- [ ] **Step 1: Write test for staff presign access**

Add to `backend/apps/feedback/tests.py` in `TestAdminAPI`:

```python
@patch("apps.feedback.services.get_channel_layer")
@patch("apps.feedback.services.create_notification")
def test_staff_can_presign_for_admin_message(self, mock_notify, mock_channel):
    mock_channel.return_value = MagicMock()
    # Admin sends a reply first
    resp = self.client.post(
        f"/api/feedback/admin/conversations/{self.conv.id}/messages/",
        {"text": "Let me check"},
    )
    msg_id = resp.data["id"]
    # Admin can presign for their own message
    with patch("apps.feedback.views.boto3.client") as mock_boto:
        mock_s3 = MagicMock()
        mock_s3.generate_presigned_url.return_value = "https://s3.example.com/presigned"
        mock_boto.return_value = mock_s3
        resp = self.client.post(
            f"/api/feedback/messages/{msg_id}/presign/",
            {"file_name": "screen.png", "content_type": "image/png"},
        )
    self.assertEqual(resp.status_code, 200)
    self.assertIn("upload_url", resp.data)
```

- [ ] **Step 2: Write test for unread-total endpoint**

```python
def test_unread_total(self):
    # user already sent one message in setUp
    resp = self.client.get("/api/feedback/admin/unread-total/")
    self.assertEqual(resp.status_code, 200)
    self.assertIn("unread_total", resp.data)
    self.assertGreaterEqual(resp.data["unread_total"], 0)
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `docker compose exec backend python manage.py test apps.feedback -v2`

Expected: 2 failures (presign 404 for staff, unread-total 404)

- [ ] **Step 4: Implement staff access in presign_view and confirm_attach_view**

In `backend/apps/feedback/views.py`, update `presign_view` (line 94-96):

```python
# Before:
msg = Message.objects.filter(
    id=message_id, conversation__user=request.user, is_admin=False,
).first()

# After:
if request.user.is_staff:
    msg = Message.objects.filter(id=message_id).first()
else:
    msg = Message.objects.filter(
        id=message_id, conversation__user=request.user, is_admin=False,
    ).first()
```

Same change in `confirm_attach_view` (line 141-143):

```python
if request.user.is_staff:
    msg = Message.objects.filter(id=message_id).select_related("conversation").first()
else:
    msg = Message.objects.filter(
        id=message_id, conversation__user=request.user, is_admin=False,
    ).select_related("conversation").first()
```

- [ ] **Step 5: Implement unread-total endpoint**

Add to `views.py`:

```python
@api_view(["GET"])
@authentication_classes(ADMIN_AUTH)
@permission_classes([IsAdminUser])
def admin_unread_total(request):
    """Суммарное количество непрочитанных обращений."""
    total = Conversation.objects.filter(
        models.Q(admin_last_read_at__isnull=True, messages__is_admin=False)
        | models.Q(messages__is_admin=False, messages__created_at__gt=models.F("admin_last_read_at"))
    ).distinct().count()
    return Response({"unread_total": total})
```

Add URL in `urls.py`:

```python
path("admin/unread-total/", views.admin_unread_total),
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `docker compose exec backend python manage.py test apps.feedback -v2`

Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/apps/feedback/views.py backend/apps/feedback/urls.py backend/apps/feedback/tests.py
git commit -m "feat(feedback): staff attachment access + unread-total endpoint"
```

---

## Task 2: MessageBubble v2 — adaptive layout + position-based radius

**Files:**
- Modify: `frontend/components/feedback/MessageBubble.tsx`

**Context to read:** `docs/superpowers/specs/2026-04-11-feedback-chat-ux-overhaul-design.md` sections 1, 2, 4.3

- [ ] **Step 1: Rewrite MessageBubble.tsx**

Replace entire file:

```tsx
'use client'

import type { FeedbackMessage } from '@/lib/types'
import { AttachmentPreview } from './AttachmentPreview'
import { cn } from '@/lib/utils'

export type BubblePosition = 'single' | 'first' | 'middle' | 'last'

interface MessageBubbleProps {
  message: FeedbackMessage
  isOwn: boolean
  position: BubblePosition
}

export function MessageBubble({ message, isOwn, position }: MessageBubbleProps) {
  // Color based on is_admin (consistent regardless of viewer)
  const bubbleColor = message.is_admin ? 'bg-[#2B5278]' : 'bg-[#182533]'

  // Simplified radius approach: compute classes directly
  const radiusClasses = (() => {
    if (position === 'single') return 'rounded-[15px]'
    // Wide screen (md+): all left, stacking side = left
    // Narrow (<md) + own: stacking side = right
    // Narrow (<md) + other: stacking side = left
    const leftStack: Record<BubblePosition, string> = {
      single: '',
      first: 'rounded-[15px] rounded-bl-[5px]',
      middle: 'rounded-r-[15px] rounded-l-[5px]',
      last: 'rounded-[15px] rounded-tl-[5px]',
    }
    const rightStack: Record<BubblePosition, string> = {
      single: '',
      first: 'rounded-[15px] rounded-br-[5px]',
      middle: 'rounded-l-[15px] rounded-r-[5px]',
      last: 'rounded-[15px] rounded-tr-[5px]',
    }
    if (!isOwn) return leftStack[position]
    // isOwn: narrow=right, wide=left
    // Use narrow (right) as default, override with md: for wide (left)
    const narrow = rightStack[position]
    const wide = leftStack[position]
    if (narrow === wide) return narrow
    // Need responsive: apply narrow by default, md: overrides
    return cn(narrow, {
      'md:rounded-[15px] md:rounded-bl-[5px]': position === 'first',
      'md:rounded-r-[15px] md:rounded-l-[5px]': position === 'middle',
      'md:rounded-[15px] md:rounded-tl-[5px]': position === 'last',
    })
  })()

  return (
    <div className={cn(
      'flex',
      // Narrow (<md): own=right, other=left. Wide (md+): all left
      isOwn ? 'justify-end md:justify-start' : 'justify-start',
    )}>
      <div className={cn(
        'max-w-[80%] px-3 py-2 text-sm',
        radiusClasses,
        bubbleColor,
      )}>
        {message.text && (
          <p className="whitespace-pre-wrap break-words text-foreground">{message.text}</p>
        )}

        {message.attachments.length > 0 && (
          <div className={cn('flex flex-col gap-1.5', message.text && 'mt-1.5')}>
            {message.attachments.map((att) => (
              <AttachmentPreview key={att.id} attachment={att} />
            ))}
          </div>
        )}

        <p className={cn(
          'text-[10px] text-right mt-1',
          message.is_admin ? 'text-white/40' : 'text-muted-foreground',
        )}>
          {new Date(message.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Start dev server if not running: `docker compose up frontend`

Open `/cabinet/feedback`, check:
- Messages render without avatars or sender names
- Bubbles have correct colors (own blue #2B5278, other dark #182533)
- Timestamps show inside bubbles

Note: grouping won't work yet — that's in ChatMessageList (Task 4).

- [ ] **Step 3: Commit**

```bash
git add frontend/components/feedback/MessageBubble.tsx
git commit -m "feat(feedback): MessageBubble v2 — adaptive layout, position-based radius, no avatars"
```

---

## Task 3: ChatInput — shared input with clipboard paste + auto-grow

**Files:**
- Create: `frontend/components/feedback/ChatInput.tsx`

- [ ] **Step 1: Create ChatInput.tsx**

```tsx
'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

interface ChatInputProps {
  onSend: (text: string) => Promise<void>
  onAttachment?: (file: File) => Promise<void>
  placeholder?: string
  showAttachButton?: boolean
}

export function ChatInput({
  onSend,
  onAttachment,
  placeholder = 'Написать сообщение...',
  showAttachButton = true,
}: ChatInputProps) {
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-grow textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [text, adjustHeight])

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || isSending) return
    setIsSending(true)
    setText('')
    try {
      await onSend(trimmed)
    } finally {
      setIsSending(false)
      // Reset height after clearing
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const processFile = async (file: File) => {
    if (!onAttachment) return
    if (!ALLOWED_TYPES.includes(file.type) && !file.type.startsWith('image/')) {
      toast.error(`Тип файла не поддерживается: ${file.name}`)
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`Файл слишком большой (макс. 10 МБ)`)
      return
    }
    try {
      await onAttachment(file)
    } catch {
      toast.error(`Не удалось загрузить: ${file.name}`)
    }
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    if (!onAttachment) return
    const items = e.clipboardData.items
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) await processFile(file)
        return
      }
    }
    // If no file in clipboard — let default paste handle text
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    for (const file of Array.from(files)) {
      await processFile(file)
    }
    e.target.value = ''
  }

  return (
    <div className="flex items-end gap-2">
      {showAttachButton && onAttachment && (
        <>
          <button
            type="button"
            className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
        </>
      )}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={placeholder}
        rows={1}
        className="flex-1 resize-none bg-muted/30 text-foreground rounded-lg text-sm border border-border/50 outline-none focus:border-primary/50 placeholder:text-muted-foreground h-9 max-h-[120px] px-3 py-2 transition-colors overflow-y-auto"
      />
      <Button
        size="icon"
        onClick={handleSend}
        disabled={!text.trim() || isSending}
        className="h-9 w-9 shrink-0 rounded-lg bg-primary hover:bg-primary/90"
      >
        <Send className="w-4 h-4" />
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/feedback/ChatInput.tsx
git commit -m "feat(feedback): ChatInput — shared input with auto-grow, Ctrl+V paste, attachments"
```

---

## Task 4: ChatMessageList — shared grouping + date separators

**Files:**
- Create: `frontend/components/feedback/ChatMessageList.tsx`

**Context:** Uses MessageBubble v2 from Task 2. Read spec sections 2, 3, 4.1.

- [ ] **Step 1: Create ChatMessageList.tsx**

```tsx
'use client'

import { useRef, useEffect } from 'react'
import type { FeedbackMessage } from '@/lib/types'
import { MessageBubble, type BubblePosition } from './MessageBubble'
import { SystemMessage } from './SystemMessage'

interface ChatMessageListProps {
  messages: FeedbackMessage[]
  isOwnMessage: (msg: FeedbackMessage) => boolean
}

const GROUPING_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

function isSystemMsg(msg: FeedbackMessage): boolean {
  return msg.text.startsWith('[SYS]') || msg.text.startsWith('⚡')
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (msgDay.getTime() === today.getTime()) return 'Сегодня'
  if (msgDay.getTime() === yesterday.getTime()) return 'Вчера'

  const day = date.getDate()
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
  const month = months[date.getMonth()]

  if (date.getFullYear() === now.getFullYear()) return `${day} ${month}`
  return `${day} ${month} ${date.getFullYear()}`
}

function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function isInSameGroup(current: FeedbackMessage, prev: FeedbackMessage): boolean {
  if (isSystemMsg(current) || isSystemMsg(prev)) return false
  if (current.is_admin !== prev.is_admin) return false
  const timeDiff = new Date(current.created_at).getTime() - new Date(prev.created_at).getTime()
  return timeDiff < GROUPING_WINDOW_MS
}

function getPosition(messages: FeedbackMessage[], index: number): BubblePosition {
  const msg = messages[index]
  const prev = index > 0 ? messages[index - 1] : null
  const next = index < messages.length - 1 ? messages[index + 1] : null
  const hasPrevInGroup = prev && !isSystemMsg(msg) && isSameDay(msg.created_at, prev.created_at) && isInSameGroup(msg, prev)
  const hasNextInGroup = next && !isSystemMsg(msg) && isSameDay(msg.created_at, next.created_at) && isInSameGroup(next, msg)

  if (hasPrevInGroup && hasNextInGroup) return 'middle'
  if (hasPrevInGroup && !hasNextInGroup) return 'last'
  if (!hasPrevInGroup && hasNextInGroup) return 'first'
  return 'single'
}

export function ChatMessageList({ messages, isOwnMessage }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <>
      {messages.map((msg, index) => {
        const prev = index > 0 ? messages[index - 1] : null
        const showDateSep = !prev || !isSameDay(msg.created_at, prev.created_at)
        const isSystem = isSystemMsg(msg)
        const position = isSystem ? 'single' as BubblePosition : getPosition(messages, index)

        // Gap: 2px within group (gap-0.5), 8px between groups (gap-2)
        const inGroup = prev && !showDateSep && !isSystem && !isSystemMsg(prev) && isInSameGroup(msg, prev)
        const gapClass = index === 0 ? '' : inGroup ? 'mt-0.5' : 'mt-2'

        return (
          <div key={msg.id} className={gapClass}>
            {showDateSep && (
              <div className="flex justify-center py-1.5">
                <span className="bg-[#213040]/80 text-white/80 text-[11px] font-medium rounded-full px-3 py-0.5">
                  {formatDateLabel(msg.created_at)}
                </span>
              </div>
            )}
            {isSystem ? (
              <SystemMessage text={msg.text} createdAt={msg.created_at} />
            ) : (
              <MessageBubble
                message={msg}
                isOwn={isOwnMessage(msg)}
                position={position}
              />
            )}
          </div>
        )
      })}
      <div ref={bottomRef} />
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/feedback/ChatMessageList.tsx
git commit -m "feat(feedback): ChatMessageList — shared grouping, Telegram-style date pills"
```

---

## Task 5: Stores — auto mark-as-read, auto-select, polling

**Files:**
- Modify: `frontend/lib/store/feedback.ts`
- Modify: `frontend/lib/store/feedback-admin.ts`
- Modify: `frontend/lib/api/feedback.ts`

- [ ] **Step 1: Add admin presign/confirm helpers to API client**

Add to `frontend/lib/api/feedback.ts` at the end of the Admin section:

```typescript
adminPresignAttachment: async (messageId: number, fileName: string, contentType: string) => {
  try {
    const { data } = await apiClient.post<{ upload_url: string; file_key: string }>(
      `/api/feedback/messages/${messageId}/presign/`,
      { file_name: fileName, content_type: contentType },
    )
    return data
  } catch (error) {
    throw normalizeError(error)
  }
},
adminConfirmAttachment: async (messageId: number, fileKey: string, fileName: string, fileSize: number, contentType: string) => {
  try {
    const { data } = await apiClient.post<{ status: string }>(
      `/api/feedback/messages/${messageId}/confirm-attach/`,
      { file_key: fileKey, file_name: fileName, file_size: fileSize, content_type: contentType },
    )
    return data
  } catch (error) {
    throw normalizeError(error)
  }
},
getUnreadTotal: async () => {
  try {
    const { data } = await apiClient.get<{ unread_total: number }>('/api/feedback/admin/unread-total/')
    return data.unread_total
  } catch (error) {
    throw normalizeError(error)
  }
},
```

Note: admin presign/confirm reuses the same user endpoints (now that backend allows staff access).

- [ ] **Step 2: Update user store — auto mark-as-read on WS message**

In `frontend/lib/store/feedback.ts`, update the WS handler inside `connectWS`. Change the `new_message` handler:

```typescript
if (event.type === 'new_message' || event.type === 'reward_granted') {
  const msg = 'message' in event ? event.message : null
  if (msg) {
    set((s) => {
      if (s.messages.some((m) => m.id === msg.id)) return s
      return {
        messages: [...s.messages, msg],
        // Don't set hasUnreadReply — we're auto-marking as read
      }
    })
    // Auto mark-as-read if chat is open (store is connected = chat is open)
    if (msg.is_admin) {
      get().markAsRead()
    }
  }
}
```

- [ ] **Step 3: Update admin store — auto mark-as-read, auto-select, polling, totalUnread**

Rewrite `frontend/lib/store/feedback-admin.ts`:

Add to state interface:
```typescript
totalUnread: number
_pollInterval: ReturnType<typeof setInterval> | null

startPolling: () => void
stopPolling: () => void
uploadAttachment: (messageId: number, file: File) => Promise<void>
```

Initialize in store: `totalUnread: 0, _pollInterval: null`

Update `sendReply` to return the message (needed for attachment flow):

```typescript
sendReply: async (text) => {
  const conv = get().activeConversation
  if (!conv) return null
  const msg = await feedbackApi.sendAdminReply(conv.id, text)
  set((s) => ({ messages: [...s.messages, msg] }))
  return msg
},
```

Update `loadConversations` to auto-select and compute totalUnread:

```typescript
loadConversations: async () => {
  set({ isLoading: true })
  try {
    const convs = await feedbackApi.getConversations(get().filters)
    const totalUnread = convs.reduce((sum, c) => sum + c.unread_by_admin, 0)
    set({ conversations: convs, totalUnread })
    // Auto-select first conversation if none active
    if (convs.length > 0 && !get().activeConversation) {
      await get().selectConversation(convs[0].id)
    }
  } finally {
    set({ isLoading: false })
  }
},
```

Add `startPolling` / `stopPolling` for 30s conversation list refresh:

```typescript
startPolling: () => {
  const poll = () => get().loadConversations()
  const interval = setInterval(poll, 30000)
  set({ _pollInterval: interval })
},
stopPolling: () => {
  const interval = get()._pollInterval
  if (interval) clearInterval(interval)
  set({ _pollInterval: null })
},
```

Update WS handler — auto mark-as-read when active conversation receives a new message:

```typescript
if (event.type === 'new_message' && !event.message.is_admin) {
  // If this conversation is currently active, mark as read immediately
  if (get().activeConversation?.id === conversationId) {
    feedbackApi.adminMarkRead(conversationId)
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, unread_by_admin: 0 } : c,
      ),
    }))
  }
}
```

Add `uploadAttachment` action for admin:

```typescript
uploadAttachment: async (messageId: number, file: File) => {
  const presign = await feedbackApi.adminPresignAttachment(messageId, file.name, file.type)
  await fetch(presign.upload_url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  })
  await feedbackApi.adminConfirmAttachment(
    messageId, presign.file_key, file.name, file.size, file.type,
  )
},
```

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api/feedback.ts frontend/lib/store/feedback.ts frontend/lib/store/feedback-admin.ts
git commit -m "feat(feedback): stores — auto mark-as-read, auto-select, polling, admin attachments"
```

---

## Task 6: FeedbackChat — refactor to shared components

**Files:**
- Modify: `frontend/components/feedback/FeedbackChat.tsx`

- [ ] **Step 1: Rewrite FeedbackChat.tsx using ChatMessageList + ChatInput**

```tsx
'use client'

import { useEffect } from 'react'
import { useFeedbackStore } from '@/lib/store/feedback'
import { ChatMessageList } from './ChatMessageList'
import { ChatInput } from './ChatInput'
import { Badge } from '@/components/ui/badge'

export function FeedbackChat() {
  const {
    conversation, messages, isLoading,
    loadConversation, loadMessages, sendMessage, uploadAttachment,
    connectWS, disconnectWS, markAsRead,
  } = useFeedbackStore()

  useEffect(() => {
    const init = async () => {
      await loadConversation()
      await loadMessages()
      connectWS()
      markAsRead()
    }
    init()
    return () => disconnectWS()
  }, [])

  const handleSend = async (text: string) => {
    await sendMessage(text)
  }

  const handleAttachment = async (file: File) => {
    // Need a message to attach to
    let msg = messages[messages.length - 1]
    if (!msg || msg.is_admin) {
      const newMsg = await sendMessage('')
      if (!newMsg) throw new Error('Не удалось создать сообщение')
      msg = newMsg
    }
    await uploadAttachment(msg.id, file)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Обратная связь</h1>
          {conversation && (
            <Badge variant={conversation.status === 'open' ? 'default' : 'secondary'}>
              {conversation.status === 'open' ? 'Открыт' : 'Решён'}
            </Badge>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {!conversation && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-muted-foreground">
              Нашли баг? Есть идея? Напишите — мы читаем каждое сообщение.
            </p>
          </div>
        )}
        <ChatMessageList messages={messages} isOwnMessage={(m) => !m.is_admin} />
      </div>

      {/* Input */}
      <div className="border-t border-border/50 px-4 py-3">
        <ChatInput
          onSend={handleSend}
          onAttachment={handleAttachment}
          placeholder="Написать сообщение..."
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Open `/cabinet/feedback`:
- Messages should render with new grouping (date pills, no avatars/names)
- Wide screen: all messages left-aligned
- Narrow screen (resize browser): own messages go right
- Enter sends, Shift+Enter adds newline
- Ctrl+V pastes image from clipboard
- Paperclip opens file picker

- [ ] **Step 3: Commit**

```bash
git add frontend/components/feedback/FeedbackChat.tsx
git commit -m "feat(feedback): FeedbackChat — refactor to shared ChatMessageList + ChatInput"
```

---

## Task 7: FeedbackDropdown + FeedbackButton — title, width, shared components

**Files:**
- Modify: `frontend/components/feedback/FeedbackDropdown.tsx`
- Modify: `frontend/components/feedback/FeedbackButton.tsx`

- [ ] **Step 1: Rewrite FeedbackDropdown.tsx**

```tsx
'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useFeedbackStore } from '@/lib/store/feedback'
import { ChatMessageList } from './ChatMessageList'
import { ChatInput } from './ChatInput'

export function FeedbackDropdown() {
  const {
    conversation, messages, isLoading,
    loadConversation, loadMessages, sendMessage, uploadAttachment,
    connectWS, disconnectWS, markAsRead,
  } = useFeedbackStore()

  useEffect(() => {
    const init = async () => {
      await loadConversation()
      await loadMessages()
      connectWS()
      markAsRead()
    }
    init()
    return () => disconnectWS()
  }, [])

  const handleSend = async (text: string) => {
    await sendMessage(text)
  }

  const handleAttachment = async (file: File) => {
    let msg = messages[messages.length - 1]
    if (!msg || msg.is_admin) {
      const newMsg = await sendMessage('')
      if (!newMsg) throw new Error('Не удалось создать сообщение')
      msg = newMsg
    }
    await uploadAttachment(msg.id, file)
  }

  const lastMessages = messages.slice(-5)

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">Чат поддержки</h3>
      </div>

      {/* Messages */}
      <div className="max-h-[360px] overflow-y-auto px-3 py-2">
        {lastMessages.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Нашли баг? Есть идея? Напишите — мы читаем каждое сообщение.
          </p>
        )}
        <ChatMessageList messages={lastMessages} isOwnMessage={(m) => !m.is_admin} />
      </div>

      {/* Input */}
      <div className="border-t px-3 py-2">
        <ChatInput
          onSend={handleSend}
          onAttachment={handleAttachment}
          placeholder="Написать сообщение..."
        />
      </div>

      {/* Footer */}
      <div className="border-t px-3 py-2">
        <Link href="/cabinet/feedback" className="text-xs text-primary hover:underline">
          Перейти к полной переписке →
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update FeedbackButton.tsx — text + PopoverContent width**

```tsx
'use client'

import { useEffect } from 'react'
import { MessageCircle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useFeedbackStore } from '@/lib/store/feedback'
import { FeedbackDropdown } from './FeedbackDropdown'

export function FeedbackButton() {
  const hasUnreadReply = useFeedbackStore((s) => s.hasUnreadReply)
  const checkUnread = useFeedbackStore((s) => s.checkUnread)

  useEffect(() => {
    checkUnread()
    const interval = setInterval(checkUnread, 30000)
    return () => clearInterval(interval)
  }, [checkUnread])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors">
          <MessageCircle className="w-4 h-4" />
          <span className="hidden sm:inline">Чат поддержки</span>
          {hasUnreadReply && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-background" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="end">
        <FeedbackDropdown />
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 3: Verify in browser**

Click "Чат поддержки" button in navbar:
- Popup title should be "Чат поддержки" (not "Связаться с нами")
- Wider popup (360px)
- Clipboard paste works
- Paperclip button opens file picker
- Messages styled consistently with cabinet page

- [ ] **Step 4: Commit**

```bash
git add frontend/components/feedback/FeedbackDropdown.tsx frontend/components/feedback/FeedbackButton.tsx
git commit -m "feat(feedback): FeedbackDropdown/Button — new title, width, shared components"
```

---

## Task 8: AdminChatPanel — button consistency, ChatInput, attachments

**Files:**
- Modify: `frontend/components/feedback/AdminChatPanel.tsx`

- [ ] **Step 1: Rewrite AdminChatPanel.tsx**

Key changes:
1. All action buttons: `variant="outline" h-8 text-xs border-border/50`
2. Replace inline input with `ChatInput`
3. Add attachment support via store's `uploadAttachment`

```tsx
'use client'

import { useEffect } from 'react'
import { Check, Tag, ExternalLink, RotateCcw } from 'lucide-react'
import { useFeedbackAdminStore } from '@/lib/store/feedback-admin'
import { ChatMessageList } from './ChatMessageList'
import { ChatInput } from './ChatInput'
import { RewardModal } from './RewardModal'
import { Button } from '@/components/ui/button'
import { KadrIcon } from '@/components/ui/kadr-icon'
import { Badge } from '@/components/ui/badge'
import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const TAG_OPTIONS = [
  { value: '', label: 'Без тега' },
  { value: 'bug', label: 'Баг' },
  { value: 'question', label: 'Вопрос' },
  { value: 'idea', label: 'Идея' },
]

export function AdminChatPanel() {
  const {
    activeConversation, messages,
    sendReply, updateConversation, grantReward, uploadAttachment,
  } = useFeedbackAdminStore()
  const [rewardOpen, setRewardOpen] = useState(false)

  if (!activeConversation) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Выберите диалог
      </div>
    )
  }

  const conv = activeConversation
  const adminUserUrl = `/admin/users/user/${conv.user.id}/change/`

  const toggleStatus = () => {
    const newStatus = conv.status === 'open' ? 'resolved' : 'open'
    updateConversation(conv.id, { status: newStatus })
  }

  const setTag = (tag: string) => {
    updateConversation(conv.id, { tag })
  }

  const handleReward = async (amount: number, comment: string) => {
    await grantReward(conv.id, amount, comment)
  }

  const handleSend = async (text: string) => {
    await sendReply(text)
  }

  const handleAttachment = async (file: File) => {
    // Send empty message first to get an ID for the attachment
    const msg = await sendReply('')
    if (!msg) throw new Error('Не удалось создать сообщение')
    await uploadAttachment(msg.id, file)
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground shrink-0">
              {conv.user.username.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-foreground truncate">{conv.user.username}</span>
                {conv.tag && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-border/50">
                    {TAG_OPTIONS.find((t) => t.value === conv.tag)?.label || conv.tag}
                  </Badge>
                )}
                <a href={adminUserUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary shrink-0">
                  <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {conv.user.email} · {conv.user.balance} Кадров
              </div>
            </div>
          </div>

          {/* Actions — all same style */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 border-border/50"
              onClick={() => setRewardOpen(true)}
            >
              <KadrIcon size="xs" /> Начислить
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 border-border/50"
              onClick={toggleStatus}
            >
              {conv.status === 'open' ? (
                <><Check className="w-3 h-3" /> Решено</>
              ) : (
                <><RotateCcw className="w-3 h-3" /> Открыть</>
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-border/50">
                  <Tag className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {TAG_OPTIONS.map((opt) => (
                  <DropdownMenuItem key={opt.value} onClick={() => setTag(opt.value)}>
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <ChatMessageList messages={messages} isOwnMessage={(m) => m.is_admin} />
      </div>

      {/* Input */}
      <div className="border-t border-border/50 px-4 py-3">
        <ChatInput
          onSend={handleSend}
          onAttachment={handleAttachment}
          placeholder="Ответить..."
        />
      </div>

      <RewardModal
        open={rewardOpen}
        onOpenChange={setRewardOpen}
        onSubmit={handleReward}
        userName={conv.user.username}
      />
    </div>
  )
}
```

Note: `sendReply` now returns `FeedbackMessage | null` (updated in Task 5). Admin attachment flow uses the same user presign/confirm endpoints with staff access (Task 1).

- [ ] **Step 2: Verify in browser**

Open `/cabinet/inbox`:
- All three buttons (Начислить, Решено, Тег) should have identical height/style
- Messages use shared ChatMessageList (date pills, grouping, adaptive layout)
- Enter sends message
- Tag badge moved inline next to username

- [ ] **Step 3: Commit**

```bash
git add frontend/components/feedback/AdminChatPanel.tsx
git commit -m "feat(feedback): AdminChatPanel — consistent buttons, shared ChatInput/ChatMessageList"
```

---

## Task 9: ConversationList — badge position + layout

**Files:**
- Modify: `frontend/components/feedback/ConversationList.tsx`

- [ ] **Step 1: Update ConversationList layout**

Key changes:
1. Unread badge: move to right of preview line, Telegram-style pill
2. Tag: move inline with name (remove third row)
3. Badge size: `min-w-[20px] h-5 text-[11px]`

Update the conversation item layout in `ConversationList.tsx`:

Replace the `<button>` content (lines 102-136) with:

```tsx
<div className="flex items-start gap-2.5">
  {/* Avatar */}
  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary shrink-0">
    {conv.user.username.charAt(0).toUpperCase()}
  </div>

  <div className="flex-1 min-w-0">
    {/* Row 1: Name + Tag + Time */}
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm font-medium truncate">{conv.user.username}</span>
        {conv.tag && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0">
            {TAG_LABELS[conv.tag] || conv.tag}
          </Badge>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
        {conv.last_message_preview && formatTime(conv.last_message_preview.created_at)}
      </span>
    </div>

    {/* Row 2: Preview + Unread badge */}
    <div className="flex items-center justify-between mt-0.5">
      {conv.last_message_preview ? (
        <p className="text-xs text-muted-foreground truncate flex-1 min-w-0">
          {conv.last_message_preview.is_admin && <span className="text-primary">Вы: </span>}
          {conv.last_message_preview.text}
        </p>
      ) : (
        <span />
      )}
      {conv.unread_by_admin > 0 && (
        <span className="min-w-[20px] h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-medium flex items-center justify-center px-1.5 ml-2 shrink-0">
          {conv.unread_by_admin > 99 ? '99+' : conv.unread_by_admin}
        </span>
      )}
    </div>
  </div>
</div>
```

- [ ] **Step 2: Verify in browser**

Open `/cabinet/inbox`:
- Badge appears right of preview text (Telegram-style)
- Tag badge inline with name
- No third row
- Badge is a pill shape, 20px min-width

- [ ] **Step 3: Commit**

```bash
git add frontend/components/feedback/ConversationList.tsx
git commit -m "feat(feedback): ConversationList — Telegram-style badge, inline tags"
```

---

## Task 10: Cabinet layout — full-height feedback + unread badge in nav

**Files:**
- Modify: `frontend/app/(cabinet)/cabinet/layout.tsx`

- [ ] **Step 1: Add /cabinet/feedback to full-height condition**

In `cabinet/layout.tsx`, update the content area (line 151-158):

```tsx
const isFullHeight = pathname === "/cabinet/inbox" || pathname === "/cabinet/feedback"

// In the JSX:
<div className={cn(
  "flex-1 rounded-md border border-border bg-background shadow-[var(--shadow-card)]",
  isFullHeight ? "flex flex-col overflow-hidden" : "overflow-y-auto"
)}>
  {isFullHeight ? (
    children
  ) : (
    <div className="max-w-5xl mx-auto p-8 space-y-6">{children}</div>
  )}
</div>
```

- [ ] **Step 2: Add unread badge to "Входящие" nav item**

This requires the admin store's `totalUnread`. Add to layout:

```tsx
import { useFeedbackAdminStore } from '@/lib/store/feedback-admin'

// Inside component body:
const totalUnread = useFeedbackAdminStore((s) => s.totalUnread)
const loadConversations = useFeedbackAdminStore((s) => s.loadConversations)

useEffect(() => {
  if (user?.is_staff) loadConversations()
}, [user?.is_staff, loadConversations])
```

Update the nav item rendering to show badge for "Входящие":

```tsx
{section.items.map(({ href, label, icon: Icon }) => {
  const active = pathname.startsWith(href);
  const unreadBadge = href === '/cabinet/inbox' && totalUnread > 0
  return (
    <Link key={href} href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      )}>
      <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
      {label}
      {unreadBadge && (
        <span className="min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center px-1 ml-auto">
          {totalUnread > 99 ? '99+' : totalUnread}
        </span>
      )}
    </Link>
  )
})}
```

- [ ] **Step 3: Verify in browser**

1. Open `/cabinet/feedback` — should be full-height (no padding wrapper, stretches)
2. Open `/cabinet/inbox` — should auto-select first conversation
3. If there are unread messages, "Входящие" in sidebar shows badge count

- [ ] **Step 4: Commit**

```bash
git add frontend/app/\(cabinet\)/cabinet/layout.tsx
git commit -m "feat(feedback): cabinet layout — full-height feedback, unread badge in sidebar nav"
```

---

## Task 11: AdminFeedbackInbox — polling lifecycle

**Files:**
- Modify: `frontend/components/feedback/AdminFeedbackInbox.tsx`

- [ ] **Step 1: Add polling start/stop to AdminFeedbackInbox**

```tsx
'use client'

import { useEffect } from 'react'
import { useFeedbackAdminStore } from '@/lib/store/feedback-admin'
import { ConversationList } from './ConversationList'
import { AdminChatPanel } from './AdminChatPanel'

export function AdminFeedbackInbox() {
  const disconnectWS = useFeedbackAdminStore((s) => s.disconnectWS)
  const startPolling = useFeedbackAdminStore((s) => s.startPolling)
  const stopPolling = useFeedbackAdminStore((s) => s.stopPolling)

  useEffect(() => {
    startPolling()
    return () => {
      stopPolling()
      disconnectWS()
    }
  }, [startPolling, stopPolling, disconnectWS])

  return (
    <div className="flex flex-1 h-full min-h-0">
      <ConversationList />
      <AdminChatPanel />
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Open `/cabinet/inbox`:
1. First conversation auto-selected immediately
2. New messages from user show up in conversation list badges within 30s
3. When viewing a conversation with unread messages, badge clears automatically
4. No "Выберите диалог" empty state if conversations exist

- [ ] **Step 3: Commit**

```bash
git add frontend/components/feedback/AdminFeedbackInbox.tsx
git commit -m "feat(feedback): AdminFeedbackInbox — polling lifecycle, auto-select"
```

---

## Task 12: Final verification and cleanup

- [ ] **Step 1: Cross-surface consistency check**

Open each chat surface and verify identical behavior:

| Check | FeedbackDropdown | FeedbackChat | AdminChatPanel |
|---|---|---|---|
| Messages grouped (2px/8px) | ✓ | ✓ | ✓ |
| Date pills (not lines) | ✓ | ✓ | ✓ |
| No avatars in messages | ✓ | ✓ | ✓ |
| No sender names | ✓ | ✓ | ✓ |
| Enter sends | ✓ | ✓ | ✓ |
| Ctrl+V paste | ✓ | ✓ | ✓ |
| Paperclip attach | ✓ | ✓ | — (later) |
| Input/Send same height | ✓ | ✓ | ✓ |
| Wide: all left | ✓ | ✓ | ✓ |
| Narrow: own right | ✓ | ✓ | ✓ |

- [ ] **Step 2: Mobile check**

Open in browser dev tools mobile viewport:
- Messages layout: own right, other left
- Input usable on small screen
- Paperclip/file picker works

- [ ] **Step 3: Run backend tests**

Run: `docker compose exec backend python manage.py test apps.feedback -v2`

Expected: All tests PASS

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(feedback): UX overhaul — Telegram-style chat, shared components, auto mark-as-read"
```
