"""
Elements module — domain services (CRUD).
Orchestration (create_generation, create_upload) lives in elements/orchestration.py.
"""
from typing import Optional, List

from apps.ai_providers.services import (  # noqa: F401 — re-exported for backward compat
    substitute_variables,
    collect_unresolved_placeholders,
    build_generation_context,
)
from apps.scenes.models import Scene
from .models import Element


def create_element(
    scene: Scene,
    element_type: str,
    file_url: str = '',
    thumbnail_url: str = '',
    prompt_text: str = '',
    is_favorite: bool = False
) -> Element:
    """
    Создание нового элемента.

    Args:
        scene: Сцена, к которой относится элемент
        element_type: Тип элемента (IMAGE или VIDEO)
        file_url: URL файла (опционально)
        thumbnail_url: URL превью (опционально)
        prompt_text: Текст промпта (опционально)
        is_favorite: Избранное (по умолчанию False)

    Returns:
        Созданный элемент
    """
    element = Element.objects.create(
        scene=scene,
        project=scene.project,
        element_type=element_type,
        file_url=file_url,
        thumbnail_url=thumbnail_url,
        prompt_text=prompt_text,
        is_favorite=is_favorite
    )
    return element


def update_element(
    element: Element,
    file_url: Optional[str] = None,
    thumbnail_url: Optional[str] = None,
    prompt_text: Optional[str] = None,
    is_favorite: Optional[bool] = None
) -> Element:
    """
    Обновление элемента.
    
    Args:
        element: Объект элемента
        file_url: Новый URL файла (опционально)
        thumbnail_url: Новый URL превью (опционально)
        prompt_text: Новый текст промпта (опционально)
        is_favorite: Новое значение избранного (опционально)
        
    Returns:
        Обновленный элемент
    """
    if file_url is not None:
        element.file_url = file_url
    if thumbnail_url is not None:
        element.thumbnail_url = thumbnail_url
    if prompt_text is not None:
        element.prompt_text = prompt_text
    if is_favorite is not None:
        element.is_favorite = is_favorite
    
    element.save()
    return element


def toggle_favorite(element: Element) -> Element:
    """
    Переключение статуса избранного.
    
    Args:
        element: Объект элемента
        
    Returns:
        Обновленный элемент
    """
    element.is_favorite = not element.is_favorite
    element.save()
    return element


def delete_element(element: Element) -> None:
    """
    Удаление элемента.
    
    Args:
        element: Объект элемента для удаления
    """
    element.delete()


def get_scene_elements(scene: Scene, element_type: Optional[str] = None) -> List[Element]:
    """
    Получение всех элементов сцены.
    
    Args:
        scene: Сцена
        element_type: Фильтр по типу (IMAGE или VIDEO), опционально
        
    Returns:
        Список элементов, отсортированных по дате создания (новые первыми)
    """
    queryset = Element.objects.filter(scene=scene).select_related('project', 'scene')
    
    if element_type:
        queryset = queryset.filter(element_type=element_type)
    
    return list(queryset)


def get_favorite_elements(scene: Scene) -> List[Element]:
    """
    Получение избранных элементов сцены.
    
    Args:
        scene: Сцена
        
    Returns:
        Список избранных элементов
    """
    return list(
        Element.objects.filter(scene=scene, is_favorite=True)
        .select_related('project', 'scene')
    )


def reorder_elements(element_ids: List[int]) -> None:
    """
    Изменение порядка элементов.

    Args:
        element_ids: Список ID элементов в новом порядке
    """
    for index, element_id in enumerate(element_ids):
        Element.objects.filter(id=element_id).update(order_index=index)



# Re-export orchestration functions for backward compatibility.
# New code should import from apps.elements.orchestration directly.
from apps.elements.orchestration import create_generation, create_upload  # noqa: F401
