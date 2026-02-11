"""
Бизнес-логика для работы с элементами.
"""
from typing import Optional, List, Dict, Any
import re
from apps.boxes.models import Box
from .models import Asset


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


def create_asset(
    box: Box,
    asset_type: str,
    file_url: str = '',
    thumbnail_url: str = '',
    prompt_text: str = '',
    is_favorite: bool = False
) -> Asset:
    """
    Создание нового элемента.
    
    Args:
        box: Сцена, к которой относится элемент
        asset_type: Тип элемента (IMAGE или VIDEO)
        file_url: URL файла (опционально)
        thumbnail_url: URL превью (опционально)
        prompt_text: Текст промпта (опционально)
        is_favorite: Избранное (по умолчанию False)
        
    Returns:
        Созданный элемент
    """
    asset = Asset.objects.create(
        box=box,
        asset_type=asset_type,
        file_url=file_url,
        thumbnail_url=thumbnail_url,
        prompt_text=prompt_text,
        is_favorite=is_favorite
    )
    return asset


def update_asset(
    asset: Asset,
    file_url: Optional[str] = None,
    thumbnail_url: Optional[str] = None,
    prompt_text: Optional[str] = None,
    is_favorite: Optional[bool] = None
) -> Asset:
    """
    Обновление элемента.
    
    Args:
        asset: Объект элемента
        file_url: Новый URL файла (опционально)
        thumbnail_url: Новый URL превью (опционально)
        prompt_text: Новый текст промпта (опционально)
        is_favorite: Новое значение избранного (опционально)
        
    Returns:
        Обновленный элемент
    """
    if file_url is not None:
        asset.file_url = file_url
    if thumbnail_url is not None:
        asset.thumbnail_url = thumbnail_url
    if prompt_text is not None:
        asset.prompt_text = prompt_text
    if is_favorite is not None:
        asset.is_favorite = is_favorite
    
    asset.save()
    return asset


def toggle_favorite(asset: Asset) -> Asset:
    """
    Переключение статуса избранного.
    
    Args:
        asset: Объект элемента
        
    Returns:
        Обновленный элемент
    """
    asset.is_favorite = not asset.is_favorite
    asset.save()
    return asset


def delete_asset(asset: Asset) -> None:
    """
    Удаление элемента.
    
    Args:
        asset: Объект элемента для удаления
    """
    asset.delete()


def get_box_assets(box: Box, asset_type: Optional[str] = None) -> List[Asset]:
    """
    Получение всех элементов сцены.
    
    Args:
        box: Сцена
        asset_type: Фильтр по типу (IMAGE или VIDEO), опционально
        
    Returns:
        Список элементов, отсортированных по дате создания (новые первыми)
    """
    queryset = Asset.objects.filter(box=box).select_related('box', 'box__project')
    
    if asset_type:
        queryset = queryset.filter(asset_type=asset_type)
    
    return list(queryset)


def get_favorite_assets(box: Box) -> List[Asset]:
    """
    Получение избранных элементов сцены.
    
    Args:
        box: Сцена
        
    Returns:
        Список избранных элементов
    """
    return list(
        Asset.objects.filter(box=box, is_favorite=True)
        .select_related('box', 'box__project')
    )


def reorder_assets(asset_ids: List[int]) -> None:
    """
    Изменение порядка элементов.
    
    Args:
        asset_ids: Список ID элементов в новом порядке
    """
    for index, asset_id in enumerate(asset_ids):
        Asset.objects.filter(id=asset_id).update(order_index=index)
