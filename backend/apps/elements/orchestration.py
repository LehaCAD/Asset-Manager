"""
Elements orchestration — coordinates credits, elements, storage, and Celery tasks.

This is the entry point for generation and upload flows.
Called by: scenes/views.py, projects/views.py.
"""
import os
from typing import Tuple
from decimal import Decimal
from uuid import uuid4

from django.db import transaction
from rest_framework import status as http_status

from apps.ai_providers.models import AIModel
from apps.credits.models import CreditsTransaction
from apps.credits.services import CreditsService
from apps.scenes.models import Scene
from apps.storage.services import validate_file_type, detect_element_type, save_to_staging
from .models import Element
from .serializers import ElementSerializer


def create_generation(project, scene, prompt, ai_model_id, generation_config, user) -> Tuple[dict, int]:
    """
    Create element and start AI generation.
    Used by both SceneViewSet.generate and ProjectViewSet.generate.
    Returns: tuple (data_dict, http_status_code)
    """
    if not prompt:
        return {'error': 'Prompt is required'}, http_status.HTTP_400_BAD_REQUEST

    if not ai_model_id:
        return {'error': 'AI model ID is required'}, http_status.HTTP_400_BAD_REQUEST

    try:
        ai_model = AIModel.objects.get(id=ai_model_id, is_active=True)
    except AIModel.DoesNotExist:
        return {'error': 'AI model not found or inactive'}, http_status.HTTP_400_BAD_REQUEST

    # Storage limit check
    from apps.subscriptions.services import SubscriptionService
    if not SubscriptionService.check_storage(user):
        return {'error': 'Хранилище заполнено. Перейдите на более высокий тариф для увеличения объёма.'}, http_status.HTTP_403_FORBIDDEN

    element_type = ai_model.model_type

    generation_config = generation_config or {}
    input_urls = generation_config.get('input_urls')
    source_type = Element.SOURCE_GENERATED

    # --- Prompt enhancement ---
    enhance_requested = generation_config.pop("enhance_prompt", False)
    if enhance_requested:
        try:
            from apps.ai_services.services.prompt_enhance import enhance_prompt as _enhance
            result = _enhance(prompt, user)
            if result.was_enhanced:
                generation_config["_enhanced_prompt"] = result.prompt
                generation_config["_prompt_enhanced"] = True
                generation_config["_enhance_cost"] = str(result.cost)
        except Exception:
            import logging
            logging.getLogger(__name__).exception("Prompt enhancement failed, using original")

    try:
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

        element_data = {
            'project': project.id,
            'scene': scene.id if scene else None,
            'element_type': element_type,
            'prompt_text': prompt,
            'ai_model': ai_model_id,
            'generation_config': generation_config,
            'status': Element.STATUS_PENDING,
            'source_type': source_type,
            'original_filename': '',
        }

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

            if debit_result.cost:
                element.generation_config = {
                    **element.generation_config,
                    '_debit_amount': str(debit_result.cost),
                    '_debit_transaction': True,
                }
                element.save(update_fields=['generation_config'])

            CreditsTransaction.objects.filter(
                user=user,
                reason=CreditsTransaction.REASON_GENERATION_DEBIT,
                element__isnull=True,
                metadata__operation_key=operation_key,
            ).update(element=element)

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
    # Storage limit check (user derived from project)
    from apps.subscriptions.services import SubscriptionService
    if not SubscriptionService.check_storage(project.user):
        return {'error': 'Хранилище заполнено. Перейдите на более высокий тариф для увеличения объёма.'}, http_status.HTTP_403_FORBIDDEN

    if not validate_file_type(file.name):
        return (
            {'error': 'Неподдерживаемый формат файла. Допустимые форматы: JPG, PNG, MP4'},
            http_status.HTTP_400_BAD_REQUEST,
        )

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
            'original_filename': file.name or '',
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
        if os.path.exists(staging_path):
            os.unlink(staging_path)
        return (
            {'error': f'Failed to upload file: {str(e)}'},
            http_status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
