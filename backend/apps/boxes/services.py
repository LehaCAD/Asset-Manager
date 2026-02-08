"""
Бизнес-логика для работы с боксами.
"""
from typing import Optional, List
from apps.projects.models import Project
from .models import Box


def create_box(project: Project, name: str, order_index: int = 0) -> Box:
    """
    Создание нового бокса.
    
    Args:
        project: Проект, к которому относится бокс
        name: Название бокса
        order_index: Порядковый номер (по умолчанию 0)
        
    Returns:
        Созданный бокс
    """
    box = Box.objects.create(
        project=project,
        name=name,
        order_index=order_index
    )
    return box


def update_box(
    box: Box, 
    name: Optional[str] = None, 
    order_index: Optional[int] = None
) -> Box:
    """
    Обновление бокса.
    
    Args:
        box: Объект бокса
        name: Новое название (опционально)
        order_index: Новый порядковый номер (опционально)
        
    Returns:
        Обновленный бокс
    """
    if name is not None:
        box.name = name
    if order_index is not None:
        box.order_index = order_index
    
    box.save()
    return box


def reorder_boxes(box_ids: List[int]) -> None:
    """
    Изменение порядка боксов.
    
    Args:
        box_ids: Список ID боксов в новом порядке
    """
    for index, box_id in enumerate(box_ids):
        Box.objects.filter(id=box_id).update(order_index=index)


def delete_box(box: Box) -> None:
    """
    Удаление бокса.
    
    Args:
        box: Объект бокса для удаления
    """
    box.delete()


def get_project_boxes(project: Project) -> List[Box]:
    """
    Получение всех боксов проекта в правильном порядке.
    
    Args:
        project: Проект
        
    Returns:
        Список боксов, отсортированных по order_index и created_at
    """
    return list(Box.objects.filter(project=project).select_related('project'))
