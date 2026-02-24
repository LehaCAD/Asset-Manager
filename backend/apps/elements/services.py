"""
Бизнес-логика для работы с элементами.
"""
from typing import Optional, List, Dict, Any
import re
from apps.scenes.models import Scene
from .models import Element


def substitute_variables(request_schema: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Рекурсивно заменяет {{variable}} на реальные значения из context.
    
    Args:
        request_schema: Схема запроса с плейсхолдерами {{variable}}
        context: Словарь с переменными для подстановки
    
    Returns:
        Схема с подставленными значениями
    
    Example:
        >>> schema = {"prompt": "{{prompt}}", "input_urls": ["{{image_url}}"]}
        >>> context = {"prompt": "text", "image_url": "https://s3.com/img.jpg"}
        >>> substitute_variables(schema, context)
        {"prompt": "text", "input_urls": ["https://s3.com/img.jpg"]}
    """
    def replace_value(value: Any) -> Any:
        """Рекурсивная замена значений."""
        if isinstance(value, dict):
            return {k: replace_value(v) for k, v in value.items()}
        elif isinstance(value, list):
            return [replace_value(item) for item in value]
        elif isinstance(value, str):
            full_match = re.match(r'^\{\{([^}]+)\}\}$', value.strip())
            if full_match:
                var_name = full_match.group(1).strip()
                return context.get(var_name, value)
            
            pattern = r'\{\{([^}]+)\}\}'
            
            def replacer(match):
                var_name = match.group(1).strip()
                val = context.get(var_name, match.group(0))
                return str(val) if val != match.group(0) else match.group(0)
            
            return re.sub(pattern, replacer, value)
        else:
            return value
    
    return replace_value(request_schema)


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
    queryset = Element.objects.filter(scene=scene).select_related('scene', 'scene__project')
    
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
        .select_related('scene', 'scene__project')
    )


def reorder_elements(element_ids: List[int]) -> None:
    """
    Изменение порядка элементов.
    
    Args:
        element_ids: Список ID элементов в новом порядке
    """
    for index, element_id in enumerate(element_ids):
        Element.objects.filter(id=element_id).update(order_index=index)
