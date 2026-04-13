# Шеринг и отзывы

> Актуальное состояние подсистемы. Обновлять при внесении изменений.
> Последнее обновление: 2026-04-13

## Обзор

Модуль «Шеринг и отзывы» — атомарная подсистема для обратной связи между создателем и рецензентами. Две стороны:
- **Ревьюер** — на публичной странице оставляет комментарии, реакции, согласования
- **Создатель** — в workspace видит фидбек в overlay «Отзывы», отвечает

## Модели

### SharedLink
Публичная ссылка на набор элементов проекта.
- `project: FK(Project)` — проект
- `created_by: FK(User)` — создатель
- `name: CharField(100)` — название
- `elements: M2M(Element)` — элементы в ссылке
- `display_preferences: JSONField` — настройки отображения
- `token: UUID4` — уникальный публичный токен
- `expires_at: DateTimeField?` — срок действия
- `is_expired() → bool`

### Comment
Комментарий к element, scene ИЛИ shared_link (constraint: ровно один target).
- `element: FK(Element)?`
- `scene: FK(Scene)?`
- `shared_link: FK(SharedLink)?` — для общих комментариев к ссылке
- `parent: FK(self)?` — для replies (1 уровень)
- `author_name: CharField(100)` — имя автора
- `author_user: FK(User)?` — для авторизованных
- `session_id: CharField(36)` — для гостей
- `text: TextField(2000)` — HTML stripped на backend
- `is_read: BooleanField` — прочитано создателем
- `is_system: BooleanField` — системные (фильтруются)

### ElementReaction
Лайк/дизлайк на элемент. `unique_together: (element, session_id)`.
- `value: 'like' | 'dislike'`

### ElementReview
Согласование элемента. `unique_together: (element, session_id)`.
- `action: 'approved' | 'changes_requested' | 'rejected'`
- Toggle: повторный клик на тот же action → удаление

## API

### Публичные (AllowAny, rate limited)
| Method | URL | Описание |
|--------|-----|----------|
| GET | `/api/sharing/public/{token}/` | Загрузить раскадровку (элементы + комментарии + general_comments) |
| POST | `/api/sharing/public/{token}/comments/` | Комментарий (element_id ИЛИ scene_id ИЛИ ни то ни другое → general) |
| POST | `/api/sharing/public/{token}/reactions/` | Лайк/дизлайк |
| POST | `/api/sharing/public/{token}/review/` | Согласование |

### Приватные (IsAuthenticated)
| Method | URL | Описание |
|--------|-----|----------|
| CRUD | `/api/sharing/links/` | Управление ссылками |
| GET/POST | `/api/sharing/elements/{id}/comments/` | Комментарии к элементу |
| GET/POST | `/api/sharing/links/{id}/comments/` | Общие комментарии к ссылке |
| GET | `/api/sharing/project-feedback/{id}/` | Агрегированный фидбек проекта |
| PATCH | `/api/sharing/comments/{id}/read/` | Отметить прочитанным |

## WebSocket

### PublicShareConsumer (`ws/sharing/{token}/`)
Анонимный consumer для ревьюеров. Группа: `share_{token}`.
- Events: `new_comment`, `reaction_updated`, `review_updated`
- Валидация: token exists + not expired
- Broadcast: при комментарии/реакции/ревью через views

### ProjectConsumer (`ws/projects/{id}/`)
Для создателя. Расширен событиями:
- `new_comment` — новый комментарий от рецензента
- `reaction_updated` — обновление реакций
- `review_updated` — обновление согласований

## Frontend компоненты

### Сторона ревьюера (share page)
- **PublicSharePage** (`/share/[token]`) — grid элементов + lightbox
- **ReviewerLightbox** — просмотр + комментарии + реакции + согласования
- **CommentThread** — тред комментариев с replies
- **Drawer «Обсуждение»** — Sheet для общих комментариев к ссылке

### Сторона создателя (workspace)
- **ReviewsOverlay** — overlay «Отзывы» с accordion по ссылкам
- **ElementCard** — 3px цветная полоска сверху (review status)
- **DetailPanel** — реакции и ревью в lightbox sidebar

## Визуальные индикаторы

### Полоска 3px на карточках
- `emerald-500` — все согласовали
- `orange-500` — есть запросы на доработку
- `red-500/70` — есть отклонения
- Логика: worst-wins (rejected > changes_requested > approved)

### Badge непрочитанных
- Цвет: `emerald-500` (НЕ красный)
- На кнопке «Отзывы» в toolbar

## Разделение с уведомлениями

- **Bell icon** — только контент + система (генерации, загрузки, поддержка)
- **Overlay «Отзывы»** — весь фидбек от рецензентов

## Тесты

`backend/apps/sharing/tests/` — 70+ тестов:
- Модели: constraint validation, review aggregation
- Views: comment CRUD, reactions, reviews, toggle, expired links
- General comments: создание, replies, notification, creator API
- Project feedback: auth, access control, stats, unread counts
- Edge cases: XSS, rate limiting, session collision
