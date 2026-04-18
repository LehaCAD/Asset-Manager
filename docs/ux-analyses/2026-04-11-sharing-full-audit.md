## UX Analysis: Полный аудит системы шеринга
### Размер: L

---

### 1. Текущее состояние

#### Что есть сейчас
- **SharedLink** — публичная ссылка на набор элементов проекта с опциональным expiry
- **Comment** — к element или scene, 1 уровень replies, session-based авторство
- **ElementReaction** — like/dislike per element per session
- **ElementReview** — approved/changes_requested/rejected per element per session
- **Публичная страница** `/share/[token]` — grid + lightbox (ReviewerLightbox)
- **WebSocket уведомления** — владельцу при комментариях/реакциях/ревью
- **DetailPanel** в workspace lightbox — показывает реакции и ревью от рецензентов

#### Экраны и компоненты
| Компонент | Где виден | Что делает |
|-----------|-----------|-----------|
| PublicSharePage | `/share/[token]` | Grid элементов по сценам + lightbox |
| ReviewerLightbox | На share page, по клику на элемент | Полноэкранный просмотр + reactions + review + comments |
| CommentThread | В ReviewerLightbox sidebar + DetailPanel | Ввод и отображение комментариев с replies |
| ReviewerNameInput | В ReviewerLightbox, до первого действия | Ввод имени рецензента |
| ElementCard (workspace) | Рабочее пространство | Карточка с review badge в footer |
| DetailPanel | Lightbox в workspace | Секции "Реакции" и "Согласование" |
| ShareLinksPanel | Панель управления ссылками | Список ссылок проекта |
| CreateLinkDialog | Модал создания ссылки | Фильтры + название + expiry |

---

### 2. Обнаруженные проблемы

#### BUG-1: Комментарии не отображаются у создателя в real-time
**Критичность: ВЫСОКАЯ**

Backend отправляет WebSocket-событие `new_comment` в группу `project_{id}`, но frontend **полностью игнорирует** это событие. В `SceneWorkspace.tsx:132` и `WorkspaceContainer.tsx:248` обработчик WebSocket реагирует только на `element_status_changed`.

Тип `WSNewCommentEvent` определён в `types/index.ts:507`, включён в union `WSEvent`, но нигде не обрабатывается.

**Результат:** Создатель не видит новые комментарии, пока не перезагрузит страницу или не откроет lightbox заново.

**Решение:** Добавить обработчик `new_comment` в WebSocket listener. При получении — обновить `comment_count` на ElementCard, показать toast, и если открыт DetailPanel с этим элементом — подтянуть новый комментарий через API.

#### BUG-2: Реакции и ревью не синхронизируются в real-time
**Критичность: СРЕДНЯЯ**

Когда рецензент ставит лайк или согласовывает элемент:
1. Backend создаёт Notification и шлёт в `user_{owner_id}` WebSocket
2. Notification приходит в bell icon
3. Но данные реакций/ревью на ElementCard и в DetailPanel **не обновляются** без перезагрузки

**Решение:** При получении notification типа `reaction_new` или `review_new` — обновить `review_summary` и reaction counts на затронутом элементе. Можно через refetch одного элемента или через расширение WebSocket payload.

#### BUG-3: Review badge на ElementCard не влезает при узком layout
**Критичность: СРЕДНЯЯ**

В `ElementCard.tsx:601-612` review badge стоит в одной строке со статус-dropdown:
```
[Статус] [dropdown ▼]          [✓ Алексей Ивано...]
```

При компактном размере карточки (S/M) или длинном имени рецензента:
- Badge с `max-w-[60px]` + `truncate` обрезает имя, но сам div `ml-auto` может всё равно наложиться на dropdown
- Нет `flex-wrap` — при нехватке места элементы сжимаются вместо переноса
- На маленьких карточках второй ряд (статус + badge) становится нечитаемым

**Решение:** Перенести review badge из footer строки в отдельную позицию — цветная полоска сверху карточки (Frame.io паттерн). Детали — в секции "Решение".

#### BUG-4: Review badges не показываются на публичной share page
**Критичность: СРЕДНЯЯ**

API возвращает `reviews[]` в каждом элементе, но ElementCard на share page их не отображает. Рецензент не видит, что другой рецензент уже согласовал элемент.

#### BUG-5: session_id конфликт для авторизованных пользователей
**Критичность: НИЗКАЯ**

В `page.tsx` для авторизованных: `effectiveSid = user.id.toString()`. Если `user.id = "1"` и в БД есть guest session_id = `"1"` — произойдёт коллизия. Нужен namespace prefix: `user_1` vs `guest_uuid`.

#### BUG-6: comment_count annotation считает is_system комментарии
**Критичность: НИЗКАЯ**

В `public_share_view`:
```python
comment_count=Count('comments', distinct=True)  # не фильтрует is_system
```
Но при загрузке комментариев `is_system=False` фильтр стоит. Счётчик может быть больше реального количества видимых комментариев.

---

### 3. Impact Map

#### Прямо затронутые компоненты
| Файл | Что менять | Почему |
|------|-----------|--------|
| `frontend/components/element/SceneWorkspace.tsx` | Добавить обработчик `new_comment` WS | BUG-1 |
| `frontend/components/element/WorkspaceContainer.tsx` | Добавить обработчик `new_comment` WS | BUG-1 |
| `frontend/components/element/ElementCard.tsx` | Переработать review badge layout | BUG-3 |
| `frontend/app/share/[token]/page.tsx` | Показать review status на карточках | BUG-4 |
| `frontend/components/sharing/ReviewerLightbox.tsx` | Показать review status других рецензентов | BUG-4 |
| `frontend/lib/store/scene-workspace.ts` | Добавить action `updateCommentCount` | BUG-1 |
| `backend/apps/sharing/views.py` | Фикс comment_count annotation | BUG-6 |
| `backend/apps/sharing/models.py` | Добавить FK `shared_link` в Comment | Новая фича: общие комментарии |

#### Косвенно затронутые
| Файл | Зависимость |
|------|------------|
| `frontend/components/lightbox/DetailPanel.tsx` | Обновление reactions/reviews при WS event |
| `frontend/lib/types/index.ts` | Новые типы для general comment + WS share events |
| `backend/apps/notifications/services.py` | Расширить WS payload для reaction/review |
| `frontend/components/sharing/CommentThread.tsx` | Переиспользование для general comments |
| `backend/apps/sharing/consumers.py` | **Новый файл** — PublicShareConsumer |
| `backend/apps/sharing/routing.py` | **Новый файл** — WS routing для share |
| `backend/config/asgi.py` | Подключить sharing_ws routes |

---

### 4. Решение

#### 4.1 Real-time комментарии для создателя (BUG-1)

**Подход:** Обработать `new_comment` событие в WebSocket listener.

При получении `new_comment`:
1. Инкрементировать `comment_count` на затронутом ElementCard
2. Показать toast: "Новый комментарий от {author_name}"
3. Если открыт DetailPanel/LightboxModal с этим элементом — refetch комментариев

Не нужно передавать полный комментарий через WS — достаточно notification trigger + refetch.

#### 4.2 Review badge на карточках — цветная полоска (BUG-3, BUG-4)

**Рекомендация: Вариант A — цветная полоска сверху карточки (Frame.io style)**

Убрать текстовый badge из footer. Вместо него — тонкая (3px) полоска по верхнему краю thumbnail:
- `bg-emerald-500` — все ревьюеры согласовали
- `bg-orange-500` — есть запросы на доработку
- `bg-red-500/70` — есть отклонения
- Без полоски — нет ревью

Логика агрегации (worst-wins, как сейчас в backend):
```
if any rejected → red
if any changes_requested → orange
if all approved → green
no reviews → hidden
```

**Достоинства:**
- Не занимает место в footer, не конфликтует с именем файла
- Работает на любом размере карточки, включая compact
- Минимальное визуальное вмешательство
- Общепринятый паттерн (Frame.io, Notion status bars)

**На share page (для рецензентов):** та же полоска, чтобы рецензент видел агрегированный статус.

**В DetailPanel (workspace lightbox):** оставить полный список ревьюеров с badges как сейчас — это подробная информация.

#### 4.3 Общие комментарии к ссылке

**Задача:** Позволить рецензенту оставить комментарий ко всей ссылке, не привязанный к конкретному элементу.

**Два варианта:**

##### Вариант A: Comment к SharedLink (новый FK)
- Добавить `shared_link = ForeignKey(SharedLink, null=True, blank=True)` в Comment
- Обновить CheckConstraint: разрешить `(shared_link NOT NULL, element NULL, scene NULL)`
- Endpoint: расширить `POST /api/sharing/public/{token}/comments/` — если нет `element_id` и `scene_id`, создаёт comment к shared_link
- UI: кнопка "Общее обсуждение" в header share page → drawer с CommentThread

**Плюсы:** Чистая модель, комментарий привязан к конкретной ссылке, а не к сцене.
**Минусы:** Миграция, новый FK, расширение constraint.

##### Вариант B: Переиспользовать scene-level comments
- Scene-level comments уже поддержаны моделью
- На share page добавить кнопку "Обсудить" в заголовок каждой SceneSection
- Для "общего обсуждения" — использовать самую верхнюю сцену или создать виртуальную

**Плюсы:** Нет миграции, работает уже сейчас.
**Минусы:** Костыль — общий комментарий привязывается к сцене, а не к ссылке. Если ссылка содержит элементы без сцен (ungrouped) — некуда привязать.

**Рекомендация: Вариант A.** Это правильная модель данных, миграция простая (nullable FK).

##### UI для общих комментариев

**Layout на share page:**
```
┌─ Header ─────────────────────────────────────────────┐
│ [Logo] "Project Name"     [💬 3] [⚙] [🌙] [Guest]  │
└──────────────────────────────────────────────────────┘
                                     ↑
                              Кнопка "Общее обсуждение"
                              Badge с количеством комментариев
                              По клику → Drawer справа
```

**Drawer:** `Sheet` справа, шириной 380px (desktop) или fullscreen (mobile). Содержит CommentThread, привязанный к `shared_link`. Заголовок: "Общее обсуждение".

#### 4.4 Real-time для рецензентов — PublicShareConsumer (WebSocket)

**Подход:** Новый анонимный WebSocket consumer `ws/sharing/{token}/`.

**Архитектура:**
```
Рецензент A ──ws──→ PublicShareConsumer ──→ group: share_{token}
Рецензент B ──ws──→ PublicShareConsumer ──→ group: share_{token}
                                                    ↑
Backend (при комментарии/реакции/ревью) ─ group_send ┘
```

**PublicShareConsumer (~30 строк):**
- `connect()`: проверить что token существует и не expired → `group_add(share_{token})` → `accept()`
- `disconnect()`: `group_discard`
- `receive_json()`: ping → pong
- Handlers: `new_comment`, `new_reaction`, `new_review` → forward клиенту

**Что broadcast'ить в `share_{token}`:**
- `new_comment` — {comment_id, element_id, scene_id, shared_link_id, author_name, text, created_at}
- `reaction_updated` — {element_id, likes, dislikes, session_id, value}
- `review_updated` — {element_id, session_id, author_name, action}

**Изменения в views.py:**
- `public_comment_view()` — добавить `group_send(share_{token}, new_comment)`
- `public_reaction_view()` — добавить `group_send(share_{token}, reaction_updated)`
- `public_review_action()` — добавить `group_send(share_{token}, review_updated)`

**Фронт (share page):**
- Подключиться к `ws/sharing/{token}/` при загрузке страницы
- При `new_comment` — добавить комментарий в commentsMap
- При `reaction_updated` — обновить likes/dislikes на карточке
- При `review_updated` — обновить reviewMap и полоску на карточке

**Безопасность:** UUID4 token (122 бита энтропии) — тот же уровень защиты что у GET endpoint. Кто знает token — имеет доступ. Дополнительных рисков нет.

**Изоляция:** Группа `share_{token}` полностью отделена от `project_{id}`. Два независимых канала, разные consumers, разные данные. Не затрагивает существующий ProjectConsumer.

---

### 5. Развилки

#### Развилка 1: Review badge — полоска vs dot vs текст
| Вариант | Описание | Рекомендация |
|---------|----------|-------------|
| A: Полоска 3px сверху | Frame.io стиль, min visual noise | **Рекомендую** |
| B: Dot 8px в углу | Filestage стиль, компактнее но конфликтует с AI badge | Допустимо |
| C: Текстовый badge (текущий) | Информативнее, но не влезает | Убрать |

#### Развилка 2: Общие комментарии — где и как
| Вариант | Описание | Рекомендация |
|---------|----------|-------------|
| A: Кнопка в header → Drawer | Отдельная точка входа, не смешивается с element comments | **Рекомендую** |
| B: Секция "Общее" над grid | Inline, всегда видна, но занимает место | Менее удобно |
| C: Tab в ReviewerLightbox | Объединено с element comments, но путает | Не рекомендую |

#### Развилка 3: ~~Снята~~ — WebSocket через PublicShareConsumer
Решено: отдельный анонимный consumer `ws/sharing/{token}/`, группа `share_{token}`. Полная изоляция от ProjectConsumer, минимальный код, настоящий real-time.

---

### 6. Scope для имплементации

#### Этап 1: Критические фиксы (BUG-1, BUG-3, BUG-6)
**Файлы:**
- `frontend/components/element/SceneWorkspace.tsx` — обработчик `new_comment`
- `frontend/components/element/WorkspaceContainer.tsx` — обработчик `new_comment`
- `frontend/lib/store/scene-workspace.ts` — action `updateCommentCount`
- `frontend/components/element/ElementCard.tsx` — review badge → полоска
- `backend/apps/sharing/views.py` — фикс comment_count annotation

**Edge cases:**
- Element открыт в lightbox когда приходит WS event
- Множественные review от разных рецензентов одновременно
- 0 reviews / 1 review / 10 reviews

#### Этап 2: Видимость ревью (BUG-2, BUG-4)
**Файлы:**
- `frontend/app/share/[token]/page.tsx` — review status полоска на карточках
- `frontend/components/sharing/ReviewerLightbox.tsx` — показать ревью других
- `frontend/components/lightbox/DetailPanel.tsx` — auto-refresh при WS event
- `backend/apps/notifications/services.py` — расширить WS payload

#### Этап 3: Общие комментарии к ссылке
**Файлы:**
- `backend/apps/sharing/models.py` — FK `shared_link` в Comment
- `backend/apps/sharing/views.py` — endpoint расширение
- `frontend/app/share/[token]/page.tsx` — кнопка + drawer
- `frontend/lib/types/index.ts` — типы
- Миграция

#### Этап 4: Real-time WebSocket для рецензентов
**Файлы:**
- `backend/apps/sharing/consumers.py` — новый PublicShareConsumer
- `backend/apps/sharing/routing.py` — WebSocket URL `ws/sharing/{token}/`
- `backend/config/asgi.py` — подключить sharing_ws к URLRouter
- `backend/apps/sharing/views.py` — добавить group_send в comment/reaction/review views
- `frontend/app/share/[token]/page.tsx` — подключение к WS, обработчики событий
- `frontend/lib/types/index.ts` — типы WS-событий для share page

**Порядок:** 1 → 2 → 3 → 4 (каждый этап можно деплоить отдельно)

---

### 7. Mockup-диаграммы

#### 7.1 Review полоска на ElementCard (workspace)

**СЕЙЧАС:**
```
┌─────────────────────────────────┐
│                                 │
│         [Thumbnail]             │
│                                 │
├─────────────────────────────────┤
│ filename.jpg        [⋮]        │
│ Статус [Готово ▼]  [✓ Алекс..] │  ← badge в footer, не влезает
└─────────────────────────────────┘
```

**ПОСЛЕ (Вариант A — полоска):**
```
┌─────────────────────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  ← 3px полоска (green/orange/red)
│                                 │
│         [Thumbnail]             │
│                                 │
├─────────────────────────────────┤
│ filename.jpg        [⋮]        │
│ Статус [Готово ▼]              │  ← footer чистый, badge убран
└─────────────────────────────────┘
```

**Цвета полоски:**
```
═══ emerald-500  — Согласовано (все ревьюеры approved)
═══ orange-500   — На доработку (есть changes_requested)
═══ red-500/70   — Отклонено (есть rejected)
    (нет)        — Без ревью
```

**Адаптивность — все размеры карточек:**
```
 Compact (120px)     Medium (200px)       Large (300px)
┌──────────────┐   ┌───────────────────┐  ┌────────────────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓│   │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│  [Thumb]     │   │                   │  │                            │
│              │   │    [Thumbnail]    │  │       [Thumbnail]          │
│──────────────│   │                   │  │                            │
│ file.. [⋮]  │   │───────────────────│  │────────────────────────────│
└──────────────┘   │ filename   [⋮]   │  │ filename.jpg         [⋮]  │
                   │ Статус [▼]       │  │ Статус [Готово ▼]         │
                   └───────────────────┘  └────────────────────────────┘
Полоска видна        Полоска видна          Полоска видна
на любом размере     badge убран            badge убран
```

#### 7.2 Review полоска на share page (для рецензентов)

**СЕЙЧАС (нет индикации):**
```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│                  │  │                  │  │                  │
│   [Thumbnail]    │  │   [Thumbnail]    │  │   [Thumbnail]    │
│                  │  │                  │  │                  │
│ AI  [2 comments] │  │ AI              │  │     [1 comment]  │
├──────────────────┤  ├──────────────────┤  ├──────────────────┤
│ [👍 3] [👎 1]    │  │ [👍] [👎]       │  │ [👍 1] [👎]     │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

**ПОСЛЕ:**
```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │                  │
│                  │  │                  │  │                  │
│   [Thumbnail]    │  │   [Thumbnail]    │  │   [Thumbnail]    │
│                  │  │                  │  │                  │
│ AI  [2 comments] │  │ AI              │  │     [1 comment]  │
├──────────────────┤  ├──────────────────┤  ├──────────────────┤
│ [👍 3] [👎 1]    │  │ [👍] [👎]       │  │ [👍 1] [👎]     │
└──────────────────┘  └──────────────────┘  └──────────────────┘
  ↑ green (approved)    ↑ orange (changes)    ↑ нет ревью
```

#### 7.3 Общее обсуждение — кнопка в header + drawer

**Share page header:**
```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  [Раскадровка]  "Проект: Рекламный ролик"                      │
│                                                                 │
│                           [💬 Обсуждение (3)]  [⚙] [🌙] [Гость ✎] │
│                                    ↑                            │
│                         Кнопка общего обсуждения               │
│                         Badge = кол-во общих комментариев      │
└─────────────────────────────────────────────────────────────────┘
```

**Drawer (Sheet) — по клику на кнопку:**
```
                                        ┌──────────────────────────┐
                                        │ Общее обсуждение     [×] │
                                        ├──────────────────────────┤
                                        │                          │
                                        │  [A] Клиент              │
                                        │  "В целом направление    │
                                        │   правильное, но нужно   │
                                        │   переделать 3-ю сцену"  │
                                        │  2 мин назад             │
                                        │  [Ответить]              │
                                        │                          │
                                        │  [M] Режиссёр            │
                                        │  "Принято, переснимаем   │
                                        │   завтра"                │
                                        │  1 мин назад             │
                                        │                          │
                                        │  ─────────────────────── │
                                        │                          │
                                        │  [A] Продюсер            │
                                        │  "Бюджет на пересъёмку   │
                                        │   согласован"            │
                                        │  30 сек назад            │
                                        │                          │
                                        ├──────────────────────────┤
                                        │ [Как вас зовут?] [____]  │
                                        │ или (если уже назвался): │
                                        │ [________________] [→]   │
                                        │ "Ctrl+Enter"             │
                                        └──────────────────────────┘
```

**Mobile (fullscreen sheet):**
```
┌──────────────────────────────────┐
│ Общее обсуждение             [×] │
├──────────────────────────────────┤
│                                  │
│  [A] Клиент                     │
│  "В целом направление..."       │
│  2 мин назад · [Ответить]       │
│                                  │
│  [M] Режиссёр                   │
│  "Принято, переснимаем"         │
│  1 мин назад                    │
│                                  │
├──────────────────────────────────┤
│ [Написать комментарий...]   [→] │
└──────────────────────────────────┘
```

#### 7.4 Filmstrip в ReviewerLightbox — review status через border

**СЕЙЧАС:**
```
[thumb] [thumb] [*active*] [thumb] [thumb]
         all borders same color
```

**ПОСЛЕ:**
```
[thumb] [thumb] [*active*] [thumb] [thumb]
  ↑       ↑                  ↑       ↑
green   orange              (none)  green
border  border                      border
```
Неактивные thumbnails получают цветной border (2px) по статусу ревью:
- `border-emerald-500/50` — approved
- `border-orange-500/50` — changes_requested
- `border-red-500/50` — rejected
- `border-transparent` — нет ревью

#### 7.5 Toast при новом комментарии (для создателя в workspace)

```
┌──────────────────────────────────────┐
│  💬  Новый комментарий от Клиент    │
│     "В целом направление..."        │
│                        [Открыть]    │
└──────────────────────────────────────┘
```
- Показывается на 5 секунд
- "Открыть" → открывает lightbox с этим элементом на вкладке комментариев
- Если комментарий к scene — "Открыть" раскрывает группу

---

### 8. Pen-mockup

MCP tools для pen-файла не загружены в этой сессии. При переходе к имплементации — перенести диаграммы выше в `pen/pencil-new.pen` как фрейм `UX: Sharing Audit 2026-04-11`.
