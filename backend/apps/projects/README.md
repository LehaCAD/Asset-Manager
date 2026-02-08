# Projects App

Django-приложение для управления проектами в AI Asset Manager.

## Модели

### Project
- `user` (FK) - владелец проекта
- `name` - название проекта
- `created_at` - дата создания
- `updated_at` - дата последнего обновления

## Структура
```
projects/
├── migrations/          # Миграции БД
├── admin.py            # Регистрация в админке
├── apps.py             # Конфигурация приложения
├── models.py           # Модель Project
├── services.py         # Бизнес-логика
├── tests.py            # Тесты
└── views.py            # Views (будут добавлены позже)
```

## Администрирование

Модель зарегистрирована в Django Admin с:
- Отображением полей: name, user, created_at, updated_at
- Фильтрами по датам создания и обновления
- Поиском по названию, имени пользователя и email
- Группировкой полей в fieldsets

## Использование

```python
from apps.projects.services import create_project, update_project, delete_project

# Создание проекта
project = create_project(user=request.user, name="Мой проект")

# Обновление
project = update_project(project, name="Новое название")

# Удаление
delete_project(project)
```
