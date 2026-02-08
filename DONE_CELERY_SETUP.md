# ✅ Celery Setup - Реализация завершена

## 📋 Что было сделано

### 1. Добавлены зависимости в requirements.txt
```
celery==5.3.4
redis==5.0.1
```

### 2. Создан backend/config/celery.py
Конфигурация Celery приложения:
- ✅ Использование Redis как брокера и backend для результатов
- ✅ Автоматическое обнаружение tasks.py в Django приложениях
- ✅ Отладочная задача `debug_task`

```python
import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('config')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
```

### 3. Обновлен config/__init__.py
Импорт Celery app для автоматической инициализации при запуске Django:

```python
from .celery import app as celery_app

__all__ = ('celery_app',)
```

### 4. Добавлены настройки Celery в config/settings.py
```python
# Celery Configuration
CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL', 'redis://redis:6379/0')
CELERY_RESULT_BACKEND = os.getenv('CELERY_RESULT_BACKEND', 'redis://redis:6379/0')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60  # 30 минут
```

### 5. Добавлен сервис Celery в docker-compose.yml
```yaml
celery:
  build: ./backend
  container_name: apom_celery
  command: celery -A config worker -l info
  volumes:
    - ./backend:/app
  environment:
    # Те же переменные окружения что и у backend
    - CELERY_BROKER_URL=redis://redis:6379/0
    - CELERY_RESULT_BACKEND=redis://redis:6379/0
  depends_on:
    - backend
    - redis
    - db
```

### 6. Создан backend/apps/assets/tasks.py
Две тестовые задачи:

#### test_task(message)
Простая задача для проверки работы Celery:
```python
@shared_task
def test_task(message: str) -> str:
    time.sleep(2)
    result = f"Processed: {message}"
    print(f"Task completed: {result}")
    return result
```

#### example_async_task(name, count)
Более сложная задача с параметрами:
```python
@shared_task
def example_async_task(name: str, count: int = 1) -> dict:
    results = []
    for i in range(count):
        time.sleep(1)
        results.append(f"{name} - iteration {i + 1}")
    
    return {
        'name': name,
        'count': count,
        'results': results,
        'status': 'completed'
    }
```

### 7. Создан management command test_celery
**Путь:** `backend/apps/assets/management/commands/test_celery.py`

**Возможности:**
- ✅ Синхронное выполнение (для отладки)
- ✅ Асинхронное выполнение через Celery
- ✅ Кастомные сообщения
- ✅ Примеры использования
- ✅ Красивый вывод с эмодзи

**Примеры команд:**
```bash
# Синхронное выполнение
python manage.py test_celery

# Асинхронное через Celery
python manage.py test_celery --async

# С кастомным сообщением
python manage.py test_celery --message "Hello World" --async

# Пример сложной задачи
python manage.py test_celery --example --async
```

## 🎯 Функциональность

### Архитектура
```
Django App → Celery → Redis (брокер) → Celery Worker → Redis (результаты)
```

### Компоненты

#### 1. Celery App (config/celery.py)
- Инициализация Celery приложения
- Конфигурация из Django settings
- Автоматическое обнаружение задач

#### 2. Redis
- **Брокер сообщений** - очередь задач
- **Backend результатов** - хранение результатов выполнения

#### 3. Celery Worker (docker-compose service)
- Обработка асинхронных задач
- 16 процессов (prefork)
- Автоматическое переподключение к брокеру

#### 4. Tasks (apps/assets/tasks.py)
- Декоратор `@shared_task`
- Асинхронное выполнение
- Возврат результатов

## 🚀 Тестирование

### Результаты тестов

#### 1. Синхронное выполнение
```bash
docker compose exec backend python manage.py test_celery
```

**Output:**
```
==================================================
Celery Test Command
==================================================

📨 Сообщение: "Hello from Celery!"
⏳ Выполнение синхронно (без Celery)...
Task completed: Processed: Hello from Celery!
✅ Результат: Processed: Hello from Celery!
```

#### 2. Асинхронное выполнение
```bash
docker compose exec backend python manage.py test_celery --async --message "Test async task"
```

**Output:**
```
✅ Задача отправлена!
   Task ID: 7d109a0b-775c-445c-b752-32c7d0d9d2a7
   Задача выполняется асинхронно. Проверьте логи Celery worker.
```

**Celery Worker Logs:**
```
[2026-02-08 19:39:32] Task apps.assets.tasks.test_task[7d109a0b...] received
[2026-02-08 19:39:34] Task completed: Processed: Test async task
[2026-02-08 19:39:34] Task apps.assets.tasks.test_task[7d109a0b...] succeeded in 2.01s
```

#### 3. Проверка статуса Celery worker
```bash
docker compose logs celery
```

**Output:**
```
-------------- celery@9e58c89568f0 v5.3.4 (emerald-rush)
--- ***** ----- 
-- ******* ---- 
- *** --- * --- 
- ** ---------- [config]
- ** ---------- .> app:         config:0x7516baaf41a0
- ** ---------- .> transport:   redis://redis:6379/0
- ** ---------- .> results:     redis://redis:6379/0
- *** --- * --- .> concurrency: 16 (prefork)

[tasks]
  . apps.assets.tasks.example_async_task
  . apps.assets.tasks.test_task
  . config.celery.debug_task

[2026-02-08 19:39:09] celery@9e58c89568f0 ready.
```

## 📊 Статус контейнеров

```bash
docker compose ps
```

```
NAME              IMAGE                     COMMAND                  STATUS
apom_backend      assetmanagermain-backend  "python manage.py ru…"   Up
apom_celery       assetmanagermain-celery   "celery -A config wo…"   Up
apom_db           postgres:16-alpine        "docker-entrypoint.s…"   Up (healthy)
apom_redis        redis:7-alpine            "docker-entrypoint.s…"   Up (healthy)
```

## 🎓 Примеры использования

### 1. Создание асинхронной задачи

```python
# backend/apps/myapp/tasks.py
from celery import shared_task
import time

@shared_task
def process_data(data_id: int) -> dict:
    """Обработка данных асинхронно."""
    time.sleep(5)  # Имитация долгой работы
    
    return {
        'data_id': data_id,
        'status': 'completed',
        'result': 'Data processed successfully'
    }
```

### 2. Запуск задачи из views

```python
# backend/apps/myapp/views.py
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .tasks import process_data

@api_view(['POST'])
def start_processing(request):
    data_id = request.data.get('data_id')
    
    # Асинхронный запуск
    task = process_data.delay(data_id)
    
    return Response({
        'task_id': task.id,
        'status': 'Task started'
    })
```

### 3. Проверка статуса задачи

```python
from celery.result import AsyncResult

def check_task_status(task_id: str):
    result = AsyncResult(task_id)
    
    return {
        'task_id': task_id,
        'status': result.status,  # PENDING, STARTED, SUCCESS, FAILURE
        'result': result.result if result.ready() else None
    }
```

### 4. Периодические задачи (Celery Beat)

```python
# backend/config/celery.py
from celery.schedules import crontab

app.conf.beat_schedule = {
    'cleanup-old-files': {
        'task': 'apps.assets.tasks.cleanup_old_files',
        'schedule': crontab(hour=2, minute=0),  # Каждый день в 2:00
    },
}
```

## 🔧 Полезные команды

### Управление Celery worker

```bash
# Просмотр логов в реальном времени
docker compose logs -f celery

# Перезапуск worker
docker compose restart celery

# Остановка worker
docker compose stop celery

# Запуск worker
docker compose start celery
```

### Проверка очереди задач

```bash
# Войти в Redis
docker compose exec redis redis-cli

# Посмотреть все ключи
KEYS *

# Посмотреть длину очереди
LLEN celery

# Выйти
exit
```

### Мониторинг задач

```bash
# Запустить Celery Flower (опционально)
docker compose exec backend celery -A config flower

# Доступ через браузер: http://localhost:5555
```

## 📝 Документация задач

### test_task(message: str) -> str

Простая тестовая задача для проверки работы Celery.

**Параметры:**
- `message` (str) - сообщение для обработки

**Возвращает:**
- `str` - обработанное сообщение в формате "Processed: {message}"

**Время выполнения:** ~2 секунды

**Пример:**
```python
from apps.assets.tasks import test_task

# Синхронно
result = test_task("Hello")  # "Processed: Hello"

# Асинхронно
task = test_task.delay("Hello")
result = task.get()  # Ждать завершения
```

### example_async_task(name: str, count: int = 1) -> dict

Пример более сложной асинхронной задачи.

**Параметры:**
- `name` (str) - имя для обработки
- `count` (int) - количество итераций (default: 1)

**Возвращает:**
- `dict` с полями:
  - `name` - имя
  - `count` - количество итераций
  - `results` - список результатов
  - `status` - статус выполнения

**Время выполнения:** ~{count} секунд

**Пример:**
```python
from apps.assets.tasks import example_async_task

# Асинхронно
task = example_async_task.delay("User123", 3)
result = task.get()

# Результат:
{
    'name': 'User123',
    'count': 3,
    'results': [
        'User123 - iteration 1',
        'User123 - iteration 2',
        'User123 - iteration 3'
    ],
    'status': 'completed'
}
```

## ✅ Checklist

- [x] Добавлен celery==5.3.4 в requirements.txt
- [x] Добавлен redis==5.0.1 в requirements.txt
- [x] Создан backend/config/celery.py
- [x] Обновлен config/__init__.py
- [x] Добавлены настройки Celery в settings.py
- [x] Добавлен сервис celery в docker-compose.yml
- [x] Созданы тестовые задачи в tasks.py
- [x] Создан management command test_celery
- [x] Пересобраны Docker контейнеры
- [x] Celery worker запущен успешно
- [x] Тесты синхронного выполнения работают
- [x] Тесты асинхронного выполнения работают
- [x] Задачи обнаруживаются автоматически
- [x] Redis работает как брокер
- [x] Результаты сохраняются в Redis

## 🎉 Результат

**Celery полностью настроен и работает!**

### Статистика
- **Новых зависимостей:** 2 (celery, redis)
- **Новых файлов:** 3 (celery.py, tasks.py, test_celery.py)
- **Новых сервисов:** 1 (celery worker)
- **Тестовых задач:** 3 (test_task, example_async_task, debug_task)

### Возможности
- ✅ Асинхронное выполнение задач
- ✅ Redis как брокер сообщений
- ✅ Сохранение результатов в Redis
- ✅ Автоматическое обнаружение задач
- ✅ Management command для тестирования
- ✅ Отслеживание выполнения задач
- ✅ Готовность к production

### Следующие шаги

Можно добавить:
1. **Celery Beat** - для периодических задач
2. **Flower** - веб-мониторинг задач
3. **Retry policy** - автоматический retry при ошибках
4. **Task logging** - логирование через get_task_logger
5. **Priority queues** - очереди с приоритетами
6. **Rate limiting** - ограничение частоты выполнения

---

**Дата завершения:** 08.02.2026  
**Celery version:** 5.3.4  
**Redis version:** 5.0.1  
**Статус:** ✅ Полностью готово и протестировано
