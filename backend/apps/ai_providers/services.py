"""
AI Providers module — public interface.

Owns: AIProvider, AIModel, parameters, pricing compilation, generation context.
"""
import re
from typing import List, Optional, Dict, Any

from .compiler import compile_parameters_schema, compile_pricing_payload, extract_placeholders, match_placeholder_to_canonical
from .models import AIProvider, AIModel
from .validators import validate_model_admin_config


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
    parameters_schema: Optional[Any] = None,
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
        parameters_schema=parameters_schema if parameters_schema is not None else {},
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


def substitute_variables(request_schema: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Рекурсивно заменяет {{variable}} на реальные значения из context.

    Example:
        >>> schema = {"prompt": "{{prompt}}", "input_urls": ["{{image_url}}"]}
        >>> context = {"prompt": "text", "image_url": "https://s3.com/img.jpg"}
        >>> substitute_variables(schema, context)
        {"prompt": "text", "input_urls": ["https://s3.com/img.jpg"]}
    """
    def replace_value(value: Any) -> Any:
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


def collect_unresolved_placeholders(value: Any) -> List[str]:
    """
    Собирает все неразрешенные {{placeholders}} после substitute_variables.
    Нужен для fail-fast в случае неконсистентной конфигурации AIModel.
    """
    placeholders: List[str] = []
    pattern = re.compile(r'\{\{([^}]+)\}\}')

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            for nested in node.values():
                walk(nested)
            return
        if isinstance(node, list):
            for nested in node:
                walk(nested)
            return
        if isinstance(node, str):
            placeholders.extend(match.group(1).strip() for match in pattern.finditer(node))

    walk(value)
    return placeholders


def build_generation_context(
    ai_model: AIModel,
    *,
    prompt: str,
    generation_config: Dict[str, Any] | None = None,
    callback_url: str | None = None
) -> Dict[str, Any]:
    """
    Построение контекста для подстановки в request_schema.

    Собирает prompt, generation_config, callback_url и дефолты из bindings.
    """
    context: Dict[str, Any] = {
        'prompt': prompt or '',
        'model': ai_model.name,
    }

    if generation_config:
        context.update(generation_config)

    if callback_url:
        context['callback_url'] = callback_url

    for binding in ai_model.parameter_bindings.select_related('canonical_parameter').all():
        canonical_code = binding.canonical_parameter.code
        if canonical_code in context and binding.placeholder not in context:
            context[binding.placeholder] = context[canonical_code]
        if binding.placeholder not in context:
            default = binding.default_override
            if default not in ({}, None, ''):
                context[binding.placeholder] = default

    return context


__all__ = [
    'build_generation_context',
    'build_request_from_schema',
    'collect_unresolved_placeholders',
    'compile_parameters_schema',
    'compile_pricing_payload',
    'create_model',
    'create_provider',
    'extract_placeholders',
    'get_active_models',
    'get_active_providers',
    'get_provider_models',
    'match_placeholder_to_canonical',
    'substitute_variables',
    'validate_model_admin_config',
]
