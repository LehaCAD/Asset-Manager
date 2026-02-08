"""
Бизнес-логика для работы с проектами.
"""
from typing import Optional
from django.contrib.auth import get_user_model
from .models import Project

User = get_user_model()


def create_project(user: User, name: str) -> Project:
    """
    Создание нового проекта.
    
    Args:
        user: Пользователь-владелец проекта
        name: Название проекта
        
    Returns:
        Созданный проект
    """
    project = Project.objects.create(
        user=user,
        name=name
    )
    return project


def update_project(project: Project, name: Optional[str] = None) -> Project:
    """
    Обновление проекта.
    
    Args:
        project: Объект проекта
        name: Новое название (опционально)
        
    Returns:
        Обновленный проект
    """
    if name is not None:
        project.name = name
        project.save()
    return project


def delete_project(project: Project) -> None:
    """
    Удаление проекта.
    
    Args:
        project: Объект проекта для удаления
    """
    project.delete()
