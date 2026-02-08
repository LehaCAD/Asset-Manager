"""
Celery configuration for Django project.
"""
import os
from celery import Celery

# Установка переменной окружения для Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# Создание Celery приложения
app = Celery('config')

# Конфигурация из Django settings с префиксом CELERY_
app.config_from_object('django.conf:settings', namespace='CELERY')

# Автоматическое обнаружение tasks.py в Django приложениях
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Отладочная задача для проверки работы Celery."""
    print(f'Request: {self.request!r}')
