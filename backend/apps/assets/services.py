"""
Бизнес-логика для работы с ассетами.
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
            # Рекурсивно обрабатываем словари
            return {k: replace_value(v) for k, v in value.items()}
        elif isinstance(value, list):
            # Рекурсивно обрабатываем списки
            return [replace_value(item) for item in value]
        elif isinstance(value, str):
            # Проверяем, является ли вся строка одним плейсхолдером {{variable}}
            full_match = re.match(r'^\{\{([^}]+)\}\}$', value.strip())
            if full_match:
                var_name = full_match.group(1).strip()
                # Возвращаем значение из context как есть (может быть любой тип)
                return context.get(var_name, value)
            
            # Иначе заменяем все {{variable}} в строке на их строковые значения
            pattern = r'\{\{([^}]+)\}\}'
            
            def replacer(match):
                var_name = match.group(1).strip()
                val = context.get(var_name, match.group(0))
                return str(val) if val != match.group(0) else match.group(0)
            
            return re.sub(pattern, replacer, value)
        else:
            # Примитивные типы возвращаем как есть
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
    Создание нового ассета.
    
    Args:
        box: Бокс, к которому относится ассет
        asset_type: Тип ассета (IMAGE или VIDEO)
        file_url: URL файла (опционально)
        thumbnail_url: URL превью (опционально)
        prompt_text: Текст промпта (опционально)
        is_favorite: Избранное (по умолчанию False)
        
    Returns:
        Созданный ассет
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
    Обновление ассета.
    
    Args:
        asset: Объект ассета
        file_url: Новый URL файла (опционально)
        thumbnail_url: Новый URL превью (опционально)
        prompt_text: Новый текст промпта (опционально)
        is_favorite: Новое значение избранного (опционально)
        
    Returns:
        Обновленный ассет
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
        asset: Объект ассета
        
    Returns:
        Обновленный ассет
    """
    asset.is_favorite = not asset.is_favorite
    asset.save()
    return asset


def delete_asset(asset: Asset) -> None:
    """
    Удаление ассета.
    
    Args:
        asset: Объект ассета для удаления
    """
    asset.delete()


def get_box_assets(box: Box, asset_type: Optional[str] = None) -> List[Asset]:
    """
    Получение всех ассетов бокса.
    
    Args:
        box: Бокс
        asset_type: Фильтр по типу (IMAGE или VIDEO), опционально
        
    Returns:
        Список ассетов, отсортированных по дате создания (новые первыми)
    """
    queryset = Asset.objects.filter(box=box).select_related('box', 'box__project')
    
    if asset_type:
        queryset = queryset.filter(asset_type=asset_type)
    
    return list(queryset)


def get_favorite_assets(box: Box) -> List[Asset]:
    """
    Получение избранных ассетов бокса.
    
    Args:
        box: Бокс
        
    Returns:
        Список избранных ассетов
    """
    return list(
        Asset.objects.filter(box=box, is_favorite=True)
        .select_related('box', 'box__project')
    )
