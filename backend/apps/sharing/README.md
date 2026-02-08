# Sharing App

Django-приложение для управления публичными ссылками и комментариями в AI Asset Manager.

## Назначение

Это приложение позволяет:
- 🔗 **Создавать публичные ссылки** на проекты для просмотра без авторизации
- ⏰ **Управлять сроком действия** ссылок (бессрочные или с ограничением)
- 💬 **Получать комментарии** от клиентов через публичные ссылки
- ✅ **Отслеживать непрочитанные** комментарии

## Модели

### SharedLink
Публичная ссылка на проект для просмотра без авторизации.

**Поля:**
- `project` (FK) - Проект, к которому относится ссылка
- `token` (UUIDField) - Уникальный UUID токен (генерируется автоматически)
- `expires_at` (DateTimeField) - Срок действия (null = бессрочная)
- `created_at`, `updated_at` - Временные метки

**Методы:**
- `is_expired()` - Проверка, истек ли срок действия

**Особенности:**
- UUID токен генерируется автоматически
- `editable=False` - токен нельзя редактировать
- `unique=True` - токен уникален
- Бессрочные ссылки (expires_at=null)

**Связи:**
- ← Project (many-to-one, related_name='shared_links')

### Comment
Комментарий к боксу от клиента через публичную ссылку.

**Поля:**
- `box` (FK) - Бокс, к которому относится комментарий
- `author_name` (CharField) - Имя автора комментария
- `text` (TextField) - Текст комментария
- `is_read` (BooleanField) - Отметка о прочтении
- `created_at`, `updated_at` - Временные метки

**Сортировка:** 
По умолчанию по дате создания (новые первыми): `ordering = ['-created_at']`

**Связи:**
- ← Box (many-to-one, related_name='comments')

## Использование

### Создание публичной ссылки

```python
from apps.sharing.services import create_shared_link

# Бессрочная ссылка
link = create_shared_link(project)
public_url = f'https://myapp.com/public/{link.token}/'

# Ссылка на 7 дней
link = create_shared_link(project, expires_in_days=7)
```

### Получение проекта по токену

```python
from apps.sharing.services import get_project_by_token

# В public view
token = request.GET.get('token')
project = get_project_by_token(token)

if project is None:
    # Ссылка не найдена или истекла
    return HttpResponse('Ссылка недействительна', status=404)

# Показать проект
return render(request, 'public/project.html', {'project': project})
```

### Работа с комментариями

```python
from apps.sharing.services import (
    create_comment,
    mark_comment_as_read,
    get_box_comments,
    get_project_comments,
    get_unread_count
)

# Создание комментария (от клиента через публичную ссылку)
comment = create_comment(
    box=box,
    author_name='Иван Петров',
    text='Отличная работа! Но можно изменить цвет фона?'
)

# Получение комментариев бокса
comments = get_box_comments(box)
unread_comments = get_box_comments(box, unread_only=True)

# Получение всех комментариев проекта
all_comments = get_project_comments(project)
unread_only = get_project_comments(project, unread_only=True)

# Количество непрочитанных
unread_count = get_unread_count(project)

# Отметка как прочитанное
mark_comment_as_read(comment)
```

### Управление ссылками

```python
from apps.sharing.services import get_active_links, revoke_shared_link

# Получить активные ссылки проекта
active_links = get_active_links(project)

# Отозвать ссылку
revoke_shared_link(link)  # Удаляет ссылку из БД
```

## Администрирование

### SharedLink Admin
- **list_display**: token (укороченный), project, expires_at, **status** (✓/❌), created_at
- **list_filter**: created_at, expires_at, project__user
- **search_fields**: token, project__name
- **readonly_fields**: token (автогенерируется)
- **Кастомные методы**:
  - `token_display()` - показывает укороченный токен в `<code>`
  - `status_display()` - цветной статус (активна/истекла)

### Comment Admin
- **list_display**: author_name, box, text_preview (60 символов), is_read, created_at
- **list_filter**: is_read, created_at, box__project
- **search_fields**: author_name, text, box__name
- **list_editable**: is_read - можно отмечать прочитанными прямо из списка!
- **Actions**:
  - `mark_as_read` - массовая отметка как прочитанные
  - `mark_as_unread` - массовая отметка как непрочитанные
- **Кастомные методы**:
  - `text_preview()` - показывает первые 60 символов

## Сервисы

### SharedLink Services
- `create_shared_link(project, expires_in_days=None)` - Создание ссылки
- `revoke_shared_link(link)` - Отзыв ссылки (удаление)
- `get_project_by_token(token)` - Получение проекта по токену
- `get_active_links(project)` - Активные ссылки проекта

### Comment Services
- `create_comment(box, author_name, text)` - Создание комментария
- `mark_comment_as_read(comment)` - Отметка как прочитанный
- `get_box_comments(box, unread_only=False)` - Комментарии бокса
- `get_project_comments(project, unread_only=False)` - Комментарии проекта
- `get_unread_count(project)` - Количество непрочитанных

## Тесты

21 unit-тест покрывает:
- Создание моделей и атрибуты
- UUIDField генерацию и уникальность
- Метод `is_expired()` для разных сценариев
- Строковые представления с эмодзи
- Сортировку и обратные связи
- Все CRUD операции через сервисы
- Фильтрацию по unread_only
- Подсчет непрочитанных комментариев

## Интеграция с другими приложениями

```
User → Project → SharedLink (публичный доступ)
              ↓
            Box → Comment (от клиентов)
```

### API endpoints (будущее)

```python
# Public API (без авторизации)
GET  /api/public/{token}/                # Получить проект
GET  /api/public/{token}/boxes/          # Боксы проекта
POST /api/public/{token}/comments/       # Оставить комментарий

# Private API (с авторизацией)
POST /api/projects/{id}/share/           # Создать ссылку
GET  /api/projects/{id}/shared-links/    # Список ссылок
DEL  /api/shared-links/{id}/             # Отозвать ссылку
GET  /api/projects/{id}/comments/        # Комментарии проекта
PATCH /api/comments/{id}/                # Отметить прочитанным
```

## Примеры использования

### View для публичного доступа

```python
from django.shortcuts import render, get_object_or_404
from apps.sharing.services import get_project_by_token

def public_project_view(request, token):
    """Публичный просмотр проекта по токену."""
    project = get_project_by_token(token)
    
    if project is None:
        return render(request, 'public/expired.html', status=404)
    
    boxes = project.boxes.prefetch_related('assets').all()
    
    return render(request, 'public/project.html', {
        'project': project,
        'boxes': boxes,
        'token': token
    })
```

### View для создания комментария

```python
from django.http import JsonResponse
from apps.sharing.services import get_project_by_token, create_comment

def public_add_comment(request, token):
    """Добавление комментария через публичную ссылку."""
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    project = get_project_by_token(token)
    if project is None:
        return JsonResponse({'error': 'Invalid token'}, status=404)
    
    box_id = request.POST.get('box_id')
    author_name = request.POST.get('author_name')
    text = request.POST.get('text')
    
    box = project.boxes.get(id=box_id)
    comment = create_comment(box, author_name, text)
    
    return JsonResponse({
        'id': comment.id,
        'author_name': comment.author_name,
        'text': comment.text,
        'created_at': comment.created_at.isoformat()
    })
```

### Dashboard для владельца проекта

```python
from apps.sharing.services import get_project_comments, get_unread_count

def project_dashboard(request, project_id):
    """Dashboard проекта с комментариями."""
    project = get_object_or_404(Project, id=project_id, user=request.user)
    
    comments = get_project_comments(project)
    unread_count = get_unread_count(project)
    active_links = get_active_links(project)
    
    return render(request, 'dashboard/project.html', {
        'project': project,
        'comments': comments,
        'unread_count': unread_count,
        'active_links': active_links
    })
```

## WebSocket интеграция (будущее)

Для real-time уведомлений о новых комментариях:

```python
# В Django Channels consumer
async def notify_new_comment(self, event):
    """Отправка уведомления о новом комментарии."""
    await self.send(text_data=json.dumps({
        'type': 'new_comment',
        'comment_id': event['comment_id'],
        'author_name': event['author_name'],
        'box_id': event['box_id']
    }))
```

## Безопасность

✅ **UUID токены** - не инкрементальные ID, невозможно угадать  
✅ **Срок действия** - ссылки можно ограничить по времени  
✅ **Отзыв** - владелец может удалить ссылку в любой момент  
✅ **Read-only** - через публичные ссылки нельзя изменить проект  
✅ **Анонимные комментарии** - не требуют регистрации  

## Структура файлов

```
sharing/
├── migrations/
│   └── 0001_initial.py        # SharedLink + Comment
├── admin.py                   # Админка с actions и кастомными методами
├── models.py                  # SharedLink, Comment
├── services.py                # 10 функций
├── tests.py                   # 21 тест
└── README.md                  # Эта документация
```

## Следующие шаги

Готово к использованию! Можно:
1. ✅ Создавать публичные ссылки через админку или API
2. ✅ Принимать комментарии от клиентов
3. ✅ Отслеживать непрочитанные комментарии
4. 🔜 Добавить API endpoints для фронтенда
5. 🔜 WebSocket для real-time уведомлений
6. 🔜 Email уведомления о новых комментариях
