# 🚀 Celery Quick Start

## Проверка статуса

```bash
# Проверить что все контейнеры запущены
docker compose ps

# Логи Celery worker
docker compose logs celery
```

## Тестирование

### 1. Синхронное выполнение (без Celery)
```bash
docker compose exec backend python manage.py test_celery
```

### 2. Асинхронное выполнение (через Celery)
```bash
docker compose exec backend python manage.py test_celery --async
```

### 3. С кастомным сообщением
```bash
docker compose exec backend python manage.py test_celery --message "Hello World" --async
```

### 4. Пример сложной задачи
```bash
docker compose exec backend python manage.py test_celery --example --async
```

## Создание своей задачи

### 1. Создать файл tasks.py в вашем приложении

```python
# backend/apps/myapp/tasks.py
from celery import shared_task
import time

@shared_task
def my_async_task(param1: str, param2: int) -> dict:
    """Моя асинхронная задача."""
    time.sleep(5)  # Имитация работы
    
    return {
        'param1': param1,
        'param2': param2,
        'result': 'Success!'
    }
```

### 2. Использовать в views или services

```python
# backend/apps/myapp/views.py
from .tasks import my_async_task

# Запустить задачу асинхронно
task = my_async_task.delay("hello", 42)

# Получить task ID
task_id = task.id

# Проверить статус (опционально)
result = task.get(timeout=10)  # Ждать результат до 10 секунд
```

### 3. Проверить в Django shell

```bash
docker compose exec backend python manage.py shell
```

```python
from apps.myapp.tasks import my_async_task

# Запустить задачу
task = my_async_task.delay("test", 123)

# ID задачи
print(task.id)

# Проверить статус
print(task.status)  # PENDING, STARTED, SUCCESS, FAILURE

# Получить результат (блокирующий вызов)
result = task.get()
print(result)
```

## Мониторинг

### Логи в реальном времени
```bash
docker compose logs -f celery
```

### Проверка очереди в Redis
```bash
docker compose exec redis redis-cli

# Посмотреть все ключи
KEYS *

# Длина очереди celery
LLEN celery

# Выйти
exit
```

## Управление worker

```bash
# Перезапуск
docker compose restart celery

# Остановка
docker compose stop celery

# Запуск
docker compose start celery

# Посмотреть статус
docker compose ps celery
```

## Типичные сценарии

### 1. Асинхронная обработка файлов
```python
@shared_task
def process_uploaded_file(file_path: str) -> dict:
    # Обработка файла
    # Создание thumbnail
    # Сохранение в S3
    return {'status': 'done'}
```

### 2. Генерация AI контента
```python
@shared_task
def generate_ai_asset(prompt: str, model_id: int) -> dict:
    # Запрос к AI API
    # Ожидание результата
    # Сохранение ассета
    return {'asset_id': 123, 'url': '...'}
```

### 3. Массовые операции
```python
@shared_task
def bulk_export_assets(project_id: int) -> str:
    # Экспорт всех ассетов проекта
    # Создание архива
    # Загрузка на S3
    return 'https://s3.../export.zip'
```

## REST API пример

```python
# views.py
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .tasks import my_async_task

@api_view(['POST'])
def start_task(request):
    param1 = request.data.get('param1')
    param2 = request.data.get('param2')
    
    # Запустить задачу
    task = my_async_task.delay(param1, param2)
    
    return Response({
        'task_id': task.id,
        'status': 'Task started',
        'message': 'Check status at /api/task-status/{task_id}/'
    })

@api_view(['GET'])
def check_task_status(request, task_id):
    from celery.result import AsyncResult
    
    result = AsyncResult(task_id)
    
    return Response({
        'task_id': task_id,
        'status': result.status,
        'result': result.result if result.ready() else None
    })
```

## Отладка

### Если задачи не выполняются

1. Проверить логи worker:
```bash
docker compose logs celery
```

2. Проверить что Redis работает:
```bash
docker compose exec redis redis-cli ping
# Должно вернуть: PONG
```

3. Проверить что задачи обнаружены:
```bash
docker compose logs celery | grep tasks
# Должны быть в списке [tasks]
```

4. Перезапустить worker:
```bash
docker compose restart celery
```

### Если нужно добавить новые задачи

1. Создать/обновить tasks.py
2. Перезапустить worker:
```bash
docker compose restart celery
```

3. Проверить что задачи обнаружены:
```bash
docker compose logs celery | grep "tasks"
```

## Полезные ссылки

- **Документация Celery:** https://docs.celeryq.dev/
- **Redis документация:** https://redis.io/docs/
- **Детальная документация:** `DONE_CELERY_SETUP.md`
