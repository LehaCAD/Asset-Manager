# Спецификация: Шеринг и отзывы — полная переработка

> **Статус:** Черновик для согласования
> **Дата:** 2026-04-13
> **Pen-mockups:** `pen/pencil-new.pen` — ноды `xlmur`, `GHhmA`, `j7d8k`, `vf8Nv`

---

## 1. Общее описание

Модуль «Отзывы» — атомарная подсистема шеринга и обратной связи. Две стороны:
- **Ревьюер** (клиент) — на публичной странице `/share/{token}` оставляет комментарии, реакции, согласования
- **Создатель** — в workspace видит весь фидбек, отвечает, управляет

Принципы:
- **WebSocket-first** — polling только как fallback при потере соединения
- **Модульность** — sharing/отзывы как самостоятельный модуль, без жёстких зависимостей от workspace
- **Брендбук** — все цвета, иконки (Lucide), spacing по brandbook
- **Без красного на badge'ах** — красный только для ошибок. Непрочитанные отзывы = `emerald-500` или `primary` (фиолетовый)

---

## 2. Исправляемые баги

### BUG-1: Комментарии не видны создателю в real-time
**Проблема:** Backend шлёт `new_comment` через WebSocket в группу `project_{id}`, но frontend обрабатывает только `element_status_changed`. Тип `WSNewCommentEvent` определён в `types/index.ts:507`, но нигде не используется.

**Решение:**
- В `SceneWorkspace.tsx` и `WorkspaceContainer.tsx` — добавить обработчик `new_comment` в WS listener
- При получении: инкрементировать `comment_count` на ElementCard, если открыт overlay «Отзывы» — подтянуть новый комментарий
- Toast через `sonner`: «Новый комментарий от {author_name}» (5 сек)

### BUG-2: Реакции и ревью не синхронизируются
**Проблема:** Notification приходит в bell, но данные на карточках не обновляются.

**Решение:** Расширить WS-payload `new_notification` — добавить `element_id` + `action_type`. Frontend при получении notification типа `reaction_new` или `review_new` — refetch `review_summary` для элемента.

### BUG-3: Review badge не влезает в footer ElementCard
**Проблема:** Текстовый badge `[✓ Алексей Ива...]` в footer строке наложивается на dropdown статуса при compact размере.

**Решение:** Убрать текстовый badge. Заменить на цветную полоску 3px сверху карточки (секция 3).

### BUG-4: Review badges не показываются на share page
**Проблема:** API возвращает `reviews[]`, но ElementCard на share page их не отображает.

**Решение:** Добавить ту же полоску 3px на карточки share page (секция 3).

### BUG-5: session_id конфликт
**Проблема:** `user.id.toString()` может совпасть с guest UUID.

**Решение:** Prefix: `user_{id}` для авторизованных, guest UUID без prefix.

### BUG-6: comment_count считает is_system
**Проблема:** `Count('comments', distinct=True)` в `public_share_view` не фильтрует `is_system`.

**Решение:** `Count('comments', filter=Q(comments__is_system=False), distinct=True)`.

---

## 3. Цветная полоска на карточках (review status)

### Где отображается
- ElementCard в workspace (grid элементов)
- ElementCard на share page (для ревьюеров)
- Filmstrip в ReviewerLightbox (цветной border 2px на thumbnails)

### Внешний вид
Тонкая полоска (3px) по верхнему краю thumbnail, `rounded-t` по углам карточки.

### Цвета (worst-wins агрегация)
```
emerald-500   — Все ревьюеры согласовали (all approved)
orange-500    — Есть запросы на доработку (any changes_requested)
red-500/70    — Есть отклонения (any rejected)
(нет полоски) — Нет ревью
```

### Логика
```python
def aggregate_review_status(reviews):
    if not reviews:
        return None
    actions = [r.action for r in reviews]
    if 'rejected' in actions:
        return 'rejected'
    if 'changes_requested' in actions:
        return 'changes_requested'
    return 'approved'
```

### На workspace (создатель)
- Данные берутся из `review_summary` в ElementSerializer (уже есть, worst-wins)
- Текстовый badge в footer — **удаляется**
- Полоска рендерится как `<div>` над thumbnail

### На share page (ревьюер)
- Данные из `reviews[]` в PublicElement
- Та же полоска. Ревьюер видит, что другие уже согласовали/отклонили

### Filmstrip (ReviewerLightbox)
- Неактивные thumbnails: `border-2 border-emerald-500/50` / `border-orange-500/50` / `border-red-500/50` / `border-transparent`
- Активный thumbnail: стандартный `border-primary`

### Обновление в real-time
- WebSocket событие `review_updated` → обновить полоску без перезагрузки
- На share page через `PublicShareConsumer`
- В workspace через `ProjectConsumer` (расширить payload)

---

## 4. Общие комментарии к ссылке

### Модель данных

Расширить `Comment`:
```python
class Comment(models.Model):
    scene = ForeignKey('scenes.Scene', null=True, blank=True, ...)
    element = ForeignKey('elements.Element', null=True, blank=True, ...)
    shared_link = ForeignKey('sharing.SharedLink', null=True, blank=True, ...)  # НОВОЕ
    parent = ForeignKey('self', null=True, blank=True, ...)
    # ... остальные поля без изменений

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=(
                    Q(scene__isnull=False, element__isnull=True, shared_link__isnull=True) |
                    Q(scene__isnull=True, element__isnull=False, shared_link__isnull=True) |
                    Q(scene__isnull=True, element__isnull=True, shared_link__isnull=False)
                ),
                name='comment_single_target'
            )
        ]
```

### API

Расширить `POST /api/sharing/public/{token}/comments/`:
- Если нет `element_id` и `scene_id` — создать comment с `shared_link=link`
- Валидация: `text` обязателен, `author_name` + `session_id` как обычно

Новый endpoint для создателя:
- `GET /api/sharing/links/{id}/comments/` — общие комментарии к ссылке
- `POST /api/sharing/links/{id}/comments/` — ответ создателя на общий комментарий

### UI на share page (ревьюер)

Кнопка «Обсуждение» в header share page:
- Иконка: `MessageSquare` (Lucide), НЕ Telegram-стиль
- Badge с количеством комментариев — `emerald-500` (не красный)
- По клику → Sheet (drawer) справа, 380px desktop / fullscreen mobile
- Внутри: CommentThread (переиспользование существующего компонента)
- Заголовок: «Обсуждение»

### UI в overlay «Отзывы» (создатель)

Общие комментарии отображаются внизу каждого accordion ссылки:
- Иконка `MessageSquare` + label «Общий комментарий к ссылке» (фиолетовый)
- Тред комментариев с inline-ответами
- Input «Ответить...» + кнопка send (иконка `Send` из Lucide, не стрелка Telegram)

---

## 5. Overlay «Отзывы» (сторона создателя)

### Точка входа

Toggle-кнопка «Отзывы» в toolbar workspace:
- Иконка: `MessageSquare` (Lucide)
- Badge с количеством непрочитанных — `emerald-500` (не красный)
- Нажал → overlay открылся. Нажал ещё раз → закрылся
- НЕ отдельная страница — overlay поверх grid

### Layout overlay

```
┌─ Overlay (поверх grid, полная ширина) ──────────────────────────┐
│                                                                  │
│  Отзывы проекта          [Все ссылки ▾]  [Новые ↓]             │
│                                                                  │
│  ▼ Для клиента v2    3 согласовано · 1 на доработку    ● 3 нов. │
│  ├── [thumb] element-01.jpg   ✓ Дмитрий   👍 2                  │
│  │   [avatar] Анна · 2ч: «Фон слишком тёмный»                  │
│  │     [avatar] Вы · 1ч: «Исправлю»                            │
│  │   [Ответить...]                                              │
│  ├── [thumb] scene-03.mp4    ↻ Олег   👎 1                      │
│  │   [avatar] Олег · 5ч: «Не то настроение»                    │
│  │   [Ответить...]                                              │
│  └── 💬 Общий комментарий к ссылке                              │
│      [avatar] Анна · Вчера: «В целом нравится...»               │
│      [Ответить...]                                              │
│                                                                  │
│  ▶ Финальный вариант       5 согласовано               ● 1 нов. │
│  ▶ Для режиссёра           Нет отзывов                          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Accordion

Каждая ссылка — сворачиваемая секция:
- **Header:** chevron + иконка Link + название ссылки + stats + badge непрочитанных
- **Badge непрочитанных:** `emerald-500` с белым текстом (не красный)
- **Свёрнутая:** только header
- **Развёрнутая:** список элементов с комментариями + общие комментарии

### Элементы внутри accordion

Каждый элемент с фидбеком:
- **Thumbnail** (56x42px, кликабельный → lightbox)
- **Имя файла** (кликабельное, цвет `primary`/фиолетовый → lightbox, Ctrl+click → новая вкладка)
- **Статус согласования** (badge: ✓ Дмитрий / ↻ Олег / ✕ Иван)
- **Реакции** (👍 2 / 👎 1, compact)
- **Комментарии** — flat thread:
  - Аватар (цветной круг по session_id) + имя + время
  - Текст комментария
  - Ответы — с отступом, аватар + «Вы» (для создателя)
- **Input** «Ответить...» + иконка `Send` (Lucide)

### Комментарии — модель thread

НЕ quote-reply (как в Telegram). Flat thread — все сообщения идут подряд, ответы с визуальным отступом если есть `parent_id`. Новое сообщение добавляется в конец треда.

### Фильтры и сортировка

- **Фильтр по ссылке:** dropdown «Все ссылки» / конкретная ссылка
- **Сортировка:** «Новые ↓» / «Старые ↓» / «Непрочитанные»

### Навигация в lightbox

Клик по thumbnail или имени файла:
- Обычный клик → закрыть overlay, открыть lightbox с этим элементом
- Ctrl+click (или Cmd+click) → открыть элемент в новой вкладке (deep link: `/projects/{id}/groups/{scene_id}?lightbox={element_id}`)

---

## 6. Разделение с уведомлениями

### Текущее состояние

Bell icon показывает всё: `comment_new`, `reaction_new`, `review_new`, `generation_completed`, `generation_failed`, `upload_completed`, `feedback_new/reply/reward`.

Tab "Отзывы" в notifications page фильтрует: `comment_new`, `reaction_new`, `review_new`.

### Решение

С появлением overlay «Отзывы» фидбек получает собственный дом. Разделяем:

**Bell icon (уведомления)** — контент + система:
- `generation_completed` — генерация завершена
- `generation_failed` — ошибка генерации
- `upload_completed` — загрузка завершена
- `feedback_reply` — ответ поддержки
- `feedback_reward` — награда

**Overlay «Отзывы»** — весь фидбек от рецензентов:
- Комментарии к элементам
- Общие комментарии к ссылкам
- Согласования (approved / changes_requested / rejected)
- Реакции (лайки / дизлайки)

**Что убираем из Bell:**
- `comment_new` → в overlay «Отзывы»
- `reaction_new` → в overlay «Отзывы»
- `review_new` → в overlay «Отзывы»

**Tab "Отзывы" в /cabinet/notifications** — убрать (дублирование) или оставить как архив.

### Badge на кнопке «Отзывы»

Обновляется через WebSocket в real-time:
- При получении `new_notification` типа `comment_new`, `reaction_new`, `review_new` — инкрементировать badge
- Цвет badge: `emerald-500` (зелёный), НЕ красный

---

## 7. WebSocket — real-time везде

### PublicShareConsumer (для ревьюеров)

Новый анонимный WebSocket consumer:
- URL: `ws/sharing/{token}/`
- Группа: `share_{token}`
- Connect: проверить token exists + not expired → accept
- Ping/pong для keep-alive

**События (server → client):**
```typescript
// Новый комментарий (к элементу, сцене или ссылке)
{ type: 'new_comment', comment_id, element_id?, scene_id?, shared_link_id?, author_name, text, created_at }

// Обновление реакции
{ type: 'reaction_updated', element_id, likes, dislikes, session_id, value }

// Обновление ревью
{ type: 'review_updated', element_id, session_id, author_name, action }
```

**Backend broadcast:** В `public_comment_view`, `public_reaction_view`, `public_review_action` — добавить `channel_layer.group_send(f'share_{token}', event)`.

### ProjectConsumer (для создателя, расширение)

Уже обрабатывает `new_comment`. Добавить:
```typescript
// Обновление реакции от рецензента
{ type: 'reaction_updated', element_id, likes, dislikes }

// Обновление ревью от рецензента
{ type: 'review_updated', element_id, action, author_name }
```

**Backend broadcast:** В `notify_new_comment` уже шлёт в `project_{id}`. Добавить аналогичный broadcast для reaction и review.

### Frontend обработка

**Workspace (SceneWorkspace / WorkspaceContainer):**
- `new_comment` → инкрементировать comment_count, toast, обновить overlay если открыт
- `reaction_updated` → обновить reaction counts на карточке
- `review_updated` → обновить полоску на карточке, обновить overlay

**Share page:**
- `new_comment` → добавить в commentsMap, обновить comment count badge
- `reaction_updated` → обновить likes/dislikes на карточке
- `review_updated` → обновить reviewMap и полоску

### Polling как fallback

Только при потере WebSocket (после `MAX_RECONNECT_ATTEMPTS`):
- Workspace: уже есть fallback refetch interval (8 сек)
- Share page: добавить visibility-aware polling (30 сек) как fallback

---

## 8. Иконки и стиль (по брендбуку)

### Иконки (Lucide)

| Элемент | Иконка | НЕ использовать |
|---------|--------|----------------|
| Кнопка «Отзывы» | `MessageSquare` | ~~Sparkles~~ (запрещена) |
| Отправить сообщение | `Send` (Lucide) | ~~Telegram arrow~~ |
| Общий комментарий | `MessageSquare` | |
| Ссылка в accordion | `Link` | |
| Согласовано | `Check` | |
| На доработку | `RotateCcw` | |
| Отклонено | `X` | |
| Развернуть accordion | `ChevronDown` / `ChevronRight` | |
| Закрыть overlay | `X` | |
| Фильтр | `SlidersHorizontal` | |

### Цвета badge'ей

| Контекст | Цвет | НЕ использовать |
|----------|------|----------------|
| Непрочитанные отзывы | `emerald-500` (#22C55E) | ~~red~~ (не страх) |
| Согласовано (полоска) | `emerald-500` | |
| На доработку (полоска) | `orange-500` (#F97316) | |
| Отклонено (полоска) | `red-500/70` | |
| Кнопка «Отзывы» active | `primary/20` фон + `primary` текст | |

### Тексты (русский)

- «Отзывы» (не «Reviews», не «Фидбек»)
- «Обсуждение» (не «Chat», не «Discussion»)
- «Согласовано» / «На доработку» / «Отклонено»
- «Ответить...» (placeholder в input)
- «Все ссылки» / «Новые» (фильтры)
- «Нет отзывов» (empty state)

---

## 9. Новый API endpoint

### `GET /api/sharing/project-feedback/{project_id}/`

Агрегированный фидбек по всем ссылкам проекта. Для overlay «Отзывы».

```json
{
  "links": [
    {
      "id": 1,
      "name": "Для клиента v2",
      "token": "uuid",
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
          "original_filename": "element-01.jpg",
          "thumbnail_url": "...",
          "element_type": "IMAGE",
          "review_summary": { "action": "approved", "author_name": "Дмитрий" },
          "likes": 2,
          "dislikes": 0,
          "comments": [
            {
              "id": 1,
              "author_name": "Анна",
              "text": "Фон слишком тёмный",
              "created_at": "...",
              "is_read": false,
              "replies": [...]
            }
          ]
        }
      ],
      "general_comments": [
        {
          "id": 5,
          "author_name": "Анна",
          "text": "В целом нравится направление",
          "created_at": "...",
          "is_read": false,
          "replies": [...]
        }
      ]
    }
  ]
}
```

**Auth:** IsAuthenticated + project ownership
**Prefetch:** Все данные за 2-3 SQL запроса (prefetch_related), без N+1

---

## 10. Файлы для изменения

### Backend

| Файл | Что делать |
|------|-----------|
| `apps/sharing/models.py` | Добавить FK `shared_link` в Comment, обновить constraint |
| `apps/sharing/views.py` | Фикс comment_count, расширить public_comment_view, новый endpoint project-feedback |
| `apps/sharing/consumers.py` | **Новый** — PublicShareConsumer |
| `apps/sharing/routing.py` | **Новый** — WS URL `ws/sharing/{token}/` |
| `apps/sharing/serializers.py` | Сериализатор для project-feedback |
| `apps/sharing/urls.py` | Новые URL |
| `apps/notifications/services.py` | Broadcast reaction_updated, review_updated в project group |
| `config/asgi.py` | Подключить sharing_ws routes |
| Миграция | `shared_link` FK + constraint update |

### Frontend

| Файл | Что делать |
|------|-----------|
| `components/element/ElementCard.tsx` | Убрать текстовый badge, добавить полоску 3px |
| `components/element/SceneWorkspace.tsx` | Обработчик new_comment, reaction_updated, review_updated |
| `components/element/WorkspaceContainer.tsx` | То же |
| `app/share/[token]/page.tsx` | Полоска на карточках, WS подключение, обработчики |
| `components/sharing/ReviewerLightbox.tsx` | Filmstrip borders по review status |
| `components/sharing/ReviewsOverlay.tsx` | **Новый** — overlay «Отзывы» с accordion |
| `components/sharing/GeneralCommentDrawer.tsx` | **Новый** — drawer общих комментариев (share page) |
| `lib/api/sharing.ts` | Новый endpoint getProjectFeedback, addLinkComment |
| `lib/store/reviews.ts` | **Новый** — Zustand store для overlay отзывов |
| `lib/types/index.ts` | Новые типы: WS share events, ProjectFeedback |
| `lib/api/websocket.ts` | Новый ShareWebSocketManager для share page |
| `components/lightbox/DetailPanel.tsx` | Auto-refresh при WS event |
| `lib/store/notifications.ts` | Убрать feedback типы из bell, обновить TAB_TYPES |

---

## 11. Этапы реализации

### Этап 1: Баги + полоска (backend + frontend)
- BUG-1: WS обработчик new_comment
- BUG-3: Полоска вместо текстового badge
- BUG-5: session_id prefix
- BUG-6: comment_count фильтр

### Этап 2: Real-time для обеих сторон
- PublicShareConsumer (backend)
- WS подключение на share page (frontend)
- Broadcast reaction_updated, review_updated в project group
- Полоска на share page (BUG-4)
- Filmstrip borders (BUG-2)

### Этап 3: Общие комментарии
- Миграция: FK shared_link в Comment
- API: расширить public_comment_view + endpoint для создателя
- UI: drawer «Обсуждение» на share page
- WS broadcast общих комментариев

### Этап 4: Overlay «Отзывы» для создателя
- API: GET project-feedback
- ReviewsOverlay компонент (accordion, фильтры, сортировка)
- Zustand store
- Навигация в lightbox
- Разделение с уведомлениями (убрать feedback из bell)

**Каждый этап деплоится отдельно.**
