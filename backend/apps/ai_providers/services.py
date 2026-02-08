"""
Бизнес-логика для работы с AI провайдерами и моделями.
"""
from typing import List, Optional, Dict, Any
from .models import AIProvider, AIModel


def create_provider(
    name: str,
    base_url: str,
    api_key: str = '',
    is_active: bool = True
) -> AIProvider:
    """
    Создание AI провайдера.
    
    Args:
        name: Название провайдера
        base_url: Базовый URL API
        api_key: API ключ (опционально)
        is_active: Активен ли провайдер
        
    Returns:
        Созданный провайдер
    """
    provider = AIProvider.objects.create(
        name=name,
        base_url=base_url,
        api_key=api_key,
        is_active=is_active
    )
    return provider


def create_model(
    provider: AIProvider,
    name: str,
    model_type: str,
    api_endpoint: str,
    request_schema: Optional[Dict[str, Any]] = None,
    parameters_schema: Optional[Dict[str, Any]] = None,
    is_active: bool = True
) -> AIModel:
    """
    Создание AI модели.
    
    Args:
        provider: Провайдер
        name: Название модели
        model_type: Тип модели (IMAGE или VIDEO)
        api_endpoint: Путь эндпоинта
        request_schema: Схема запроса с плейсхолдерами
        parameters_schema: Схема параметров для UI
        is_active: Активна ли модель
        
    Returns:
        Созданная модель
    """
    model = AIModel.objects.create(
        provider=provider,
        name=name,
        model_type=model_type,
        api_endpoint=api_endpoint,
        request_schema=request_schema or {},
        parameters_schema=parameters_schema or {},
        is_active=is_active
    )
    return model


def get_active_providers() -> List[AIProvider]:
    """
    Получение списка активных провайдеров.
    
    Returns:
        Список активных провайдеров
    """
    return list(AIProvider.objects.filter(is_active=True))


def get_active_models(model_type: Optional[str] = None) -> List[AIModel]:
    """
    Получение списка активных моделей.
    
    Args:
        model_type: Фильтр по типу (IMAGE или VIDEO), опционально
        
    Returns:
        Список активных моделей
    """
    queryset = AIModel.objects.filter(
        is_active=True,
        provider__is_active=True
    ).select_related('provider')
    
    if model_type:
        queryset = queryset.filter(model_type=model_type)
    
    return list(queryset)


def get_provider_models(provider: AIProvider) -> List[AIModel]:
    """
    Получение всех моделей провайдера.
    
    Args:
        provider: Провайдер
        
    Returns:
        Список моделей провайдера
    """
    return list(provider.models.all())


def build_request_from_schema(
    model: AIModel,
    parameters: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Построение запроса из схемы, подставляя параметры вместо плейсхолдеров.
    
    Args:
        model: AI модель со схемой запроса
        parameters: Параметры для подстановки
        
    Returns:
        Готовый запрос для отправки к API
        
    Example:
        request_schema = {"prompt": "{{prompt}}", "width": "{{width}}"}
        parameters = {"prompt": "sunset", "width": 1024}
        -> {"prompt": "sunset", "width": 1024}
    """
    import json
    
    def replace_placeholders(obj: Any, params: Dict[str, Any]) -> Any:
        """Рекурсивная замена плейсхолдеров."""
        if isinstance(obj, dict):
            return {k: replace_placeholders(v, params) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [replace_placeholders(item, params) for item in obj]
        elif isinstance(obj, str):
            # Проверяем, является ли строка плейсхолдером
            if obj.startswith('{{') and obj.endswith('}}'):
                key = obj[2:-2].strip()
                return params.get(key, obj)
            return obj
        else:
            return obj
    
    return replace_placeholders(model.request_schema, parameters)
