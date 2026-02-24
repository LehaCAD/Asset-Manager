"""
Бизнес-логика для работы с сценами.
"""
from typing import Optional, List
from apps.projects.models import Project
from .models import Scene


def create_scene(project: Project, name: str, order_index: int = 0) -> Scene:
    """
    Создание новой сцены.
    
    Args:
        project: Проект, к которому относится сцена
        name: Название сцены
        order_index: Порядковый номер (по умолчанию 0)
        
    Returns:
        Созданная сцена
    """
    scene = Scene.objects.create(
        project=project,
        name=name,
        order_index=order_index
    )
    return scene


def update_scene(
    scene: Scene, 
    name: Optional[str] = None, 
    order_index: Optional[int] = None
) -> Scene:
    """
    Обновление сцены.
    
    Args:
        scene: Объект сцены
        name: Новое название (опционально)
        order_index: Новый порядковый номер (опционально)
        
    Returns:
        Обновленная сцена
    """
    if name is not None:
        scene.name = name
    if order_index is not None:
        scene.order_index = order_index
    
    scene.save()
    return scene


def reorder_scenes(scene_ids: List[int]) -> None:
    """
    Изменение порядка сцен.
    
    Args:
        scene_ids: Список ID сцен в новом порядке
    """
    for index, scene_id in enumerate(scene_ids):
        Scene.objects.filter(id=scene_id).update(order_index=index)


def delete_scene(scene: Scene) -> None:
    """
    Удаление сцены.
    
    Args:
        scene: Объект сцены для удаления
    """
    scene.delete()


def get_project_scenes(project: Project) -> List[Scene]:
    """
    Получение всех сцен проекта в правильном порядке.
    
    Args:
        project: Проект
        
    Returns:
        Список сцен, отсортированных по order_index и created_at
    """
    return list(Scene.objects.filter(project=project).select_related('project'))
