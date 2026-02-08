"""
Django config package initialization.
"""
# Это гарантирует, что Celery app всегда импортируется при запуске Django
from .celery import app as celery_app

__all__ = ('celery_app',)
