"""
Бизнес-логика для работы с элементами.
"""
from typing import Optional, List, Dict, Any, Tuple
import re
from decimal import Decimal
from uuid import uuid4

from django.db import transaction

from apps.ai_providers.models import AIModel
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
        # Map canonical code → placeholder name if needed
        if canonical_code in context and binding.placeholder not in context:
            context[binding.placeholder] = context[canonical_code]
        # Fill in default for missing parameters
        if binding.placeholder not in context:
            default = binding.default_override
            if default not in ({}, None, ''):
                context[binding.placeholder] = default

    return context


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


def create_generation(project, scene, prompt, ai_model_id, generation_config, user) -> Tuple[dict, int]:
    """
    Create element and start AI generation.
    Used by both SceneViewSet.generate and ProjectViewSet.generate.
    Returns: tuple (data_dict, http_status_code)
    """
    from rest_framework import status as http_status
    from apps.credits.models import CreditsTransaction
    from apps.credits.services import CreditsService
    from .serializers import ElementSerializer

    # Валидация входных данных
    if not prompt:
        return {'error': 'Prompt is required'}, http_status.HTTP_400_BAD_REQUEST

    if not ai_model_id:
        return {'error': 'AI model ID is required'}, http_status.HTTP_400_BAD_REQUEST

    # Проверка существования AI модели
    try:
        ai_model = AIModel.objects.get(id=ai_model_id, is_active=True)
    except AIModel.DoesNotExist:
        return {'error': 'AI model not found or inactive'}, http_status.HTTP_400_BAD_REQUEST

    # Определение типа элемента по модели
    element_type = ai_model.model_type  # IMAGE или VIDEO

    # Определение source_type: IMG2VID если модель VIDEO и в generation_config есть input_urls
    generation_config = generation_config or {}
    input_urls = generation_config.get('input_urls')
    if (
        element_type == 'VIDEO'
        and isinstance(input_urls, list)
        and len(input_urls) > 0
    ):
        source_type = Element.SOURCE_IMG2VID
    else:
        source_type = Element.SOURCE_GENERATED

    try:
        # Проверяем и списываем средства ДО создания элемента
        operation_key = uuid4().hex
        element = None
        credits_service = CreditsService()
        debit_result = credits_service.debit_for_generation(
            user=user,
            ai_model=ai_model,
            generation_config=generation_config,
            metadata={"operation_key": operation_key},
        )

        if not debit_result.ok:
            return (
                {'error': debit_result.error or 'Не удалось списать средства для генерации'},
                http_status.HTTP_400_BAD_REQUEST,
            )

        # Создание Element с атомарной проверкой
        element_data = {
            'project': project.id,
            'scene': scene.id if scene else None,
            'element_type': element_type,
            'prompt_text': prompt,
            'ai_model': ai_model_id,
            'generation_config': generation_config,
            'status': Element.STATUS_PENDING,
            'source_type': source_type,
        }

        with transaction.atomic():
            if scene:
                locked_scene = Scene.objects.select_for_update().get(pk=scene.pk)
                current_elements_count = locked_scene.elements.count()
            else:
                # Root level — count elements without a scene in this project
                current_elements_count = Element.objects.filter(
                    project=project, scene__isnull=True
                ).count()
            element_data['order_index'] = current_elements_count
            serializer = ElementSerializer(data=element_data)
            serializer.is_valid(raise_exception=True)
            element = serializer.save()

            # Сохраняем сумму списания в метаданных элемента для возможного возврата
            if debit_result.cost:
                element.generation_config = {
                    **element.generation_config,
                    '_debit_amount': str(debit_result.cost),
                    '_debit_transaction': True,
                }
                element.save(update_fields=['generation_config'])

            # Привязываем транзакцию дебита к созданному элементу
            CreditsTransaction.objects.filter(
                user=user,
                reason=CreditsTransaction.REASON_GENERATION_DEBIT,
                element__isnull=True,
                metadata__operation_key=operation_key,
            ).update(element=element)

        # Запускаем асинхронную генерацию
        from .tasks import start_generation
        start_generation.delay(element.id)

        return ElementSerializer(element).data, http_status.HTTP_201_CREATED

    except Exception as e:
        if 'debit_result' in locals() and debit_result.ok and debit_result.cost is not None:
            credits_service.refund_for_generation(
                user=user,
                amount=debit_result.cost,
                element=element,
                reason=CreditsTransaction.REASON_GENERATION_REFUND,
                metadata={
                    "source": "generation_setup_failure",
                    "operation_key": operation_key,
                },
            )
        return (
            {'error': f'Failed to start generation: {str(e)}'},
            http_status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


def create_upload(project, scene, file, prompt_text='', is_favorite=False, ai_model_id=None) -> Tuple[dict, int]:
    """
    Save file to staging and create Element with PROCESSING status.
    Returns: tuple (data_dict, http_status_code)
    """
    from rest_framework import status as http_status
    from apps.scenes.s3_utils import validate_file_type, detect_element_type, save_to_staging
    from .serializers import ElementSerializer

    # Валидация типа файла
    if not validate_file_type(file.name):
        return (
            {'error': 'Неподдерживаемый формат файла. Допустимые форматы: JPG, PNG, MP4'},
            http_status.HTTP_400_BAD_REQUEST,
        )

    # Определение типа элемента по расширению
    element_type = detect_element_type(file.name)

    try:
        staging_path = save_to_staging(file)
    except Exception as e:
        return (
            {'error': f'Не удалось сохранить файл: {str(e)}'},
            http_status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    try:
        element_data = {
            'project': project.id,
            'scene': scene.id if scene else None,
            'element_type': element_type,
            'order_index': 0,
            'prompt_text': prompt_text,
            'is_favorite': is_favorite,
            'status': Element.STATUS_PROCESSING,
            'source_type': Element.SOURCE_UPLOADED,
        }

        if ai_model_id:
            element_data['ai_model'] = ai_model_id

        with transaction.atomic():
            if scene:
                locked_scene = Scene.objects.select_for_update().get(pk=scene.pk)
                current_elements_count = locked_scene.elements.count()
            else:
                current_elements_count = Element.objects.filter(
                    project=project, scene__isnull=True
                ).count()
            element_data['order_index'] = current_elements_count
            serializer = ElementSerializer(data=element_data)
            serializer.is_valid(raise_exception=True)
            element = serializer.save()

        from .tasks import process_uploaded_file
        process_uploaded_file.delay(element.id, staging_path)

        return ElementSerializer(element).data, http_status.HTTP_201_CREATED

    except Exception as e:
        import os
        if os.path.exists(staging_path):
            os.unlink(staging_path)
        return (
            {'error': f'Failed to upload file: {str(e)}'},
            http_status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
