"""
Celery tasks для работы с элементами.
"""
from celery import shared_task
from celery.exceptions import Retry
import time
import requests
import logging
from django.conf import settings
from .models import Element
from .services import substitute_variables, collect_unresolved_placeholders, build_generation_context
import os
from decimal import Decimal

from apps.scenes.s3_utils import (
    generate_video_thumbnail_from_path,
    upload_staging_to_s3,
)
from apps.common.generation import (
    extract_result_url,
    finalize_generation_failure,
    finalize_generation_success,
    is_public_callback_url,
)
from apps.credits.models import CreditsTransaction
from apps.credits.services import CreditsService
from apps.ai_providers.validators import validate_model_admin_config

logger = logging.getLogger(__name__)


def notify_element_status(element: Element, status: str, file_url: str = '', error_message: str = '') -> None:
    """
    Отправить WebSocket-уведомление об изменении статуса элемента.
    Вызывается из Celery-задач при завершении/ошибке генерации.
    """
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        channel_layer = get_channel_layer()
        if channel_layer is None:
            return

        project_id = element.scene.project_id
        group_name = f'project_{project_id}'

        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                'type': 'element_status_changed',
                'element_id': element.id,
                'status': status,
                'file_url': file_url,
                'thumbnail_url': element.thumbnail_url or '',
                'error_message': error_message,
            }
        )
    except Exception as e:
        logger.warning("Не удалось отправить WebSocket-уведомление: %s", e)


@shared_task
def test_task(message: str) -> str:
    """
    Тестовая задача для проверки работы Celery.
    
    Args:
        message: Сообщение для обработки
    
    Returns:
        Обработанное сообщение
    """
    # Имитация долгой работы
    time.sleep(2)
    
    result = f"Processed: {message}"
    print(f"Task completed: {result}")
    
    return result


@shared_task
def example_async_task(name: str, count: int = 1) -> dict:
    """
    Пример асинхронной задачи с параметрами.
    
    Args:
        name: Имя для обработки
        count: Количество повторений
    
    Returns:
        Результат обработки
    """
    results = []
    
    for i in range(count):
        time.sleep(1)
        results.append(f"{name} - iteration {i + 1}")
    
    return {
        'name': name,
        'count': count,
        'results': results,
        'status': 'completed'
    }


@shared_task(bind=True, max_retries=3)
def start_generation(self, element_id: int) -> dict:
    """
    Запуск генерации через AI провайдера (Kie.ai).
    
    Args:
        element_id: ID элемента для генерации
    
    Returns:
        Результат с task_id от провайдера
    """
    try:
        # Получаем элемент
        element = Element.objects.select_related(
            'ai_model',
            'ai_model__provider',
        ).get(id=element_id)
        
        if not element.ai_model:
            raise ValueError("AI модель не указана")
        
        ai_model = element.ai_model
        provider = ai_model.provider
        
        # Формируем context для подстановки переменных
        callback_base = settings.BACKEND_BASE_URL
        callback_url = None
        if is_public_callback_url(callback_base):
            callback_url = f"{callback_base}/api/ai/callback/"
            if settings.KIE_CALLBACK_TOKEN:
                callback_url = f"{callback_url}?token={settings.KIE_CALLBACK_TOKEN}"
        
        # Добавляем параметры из generation_config (единственный источник input_urls и др.)
        validate_model_admin_config(ai_model)
        context = build_generation_context(
            ai_model,
            prompt=element.prompt_text or '',
            generation_config=element.generation_config,
            callback_url=callback_url,
        )
        # input_urls опционален для image-моделей (text-to-image): если не передан — пустой список
        if 'input_urls' not in context:
            context['input_urls'] = []
        
        # Подставляем переменные в request_schema
        request_body = substitute_variables(ai_model.request_schema, context)
        if not isinstance(request_body, dict):
            raise ValueError("request_schema должен формировать JSON object")
        if context.get('callback_url'):
            request_body['callBackUrl'] = context['callback_url']
        elif request_body.get('callBackUrl') == '{{callback_url}}':
            request_body.pop('callBackUrl', None)
        unresolved_placeholders = sorted(set(collect_unresolved_placeholders(request_body)))
        if unresolved_placeholders:
            raise ValueError(
                "AI model request_schema содержит неподставленные переменные: "
                + ", ".join(unresolved_placeholders)
            )
        
        # URL для запроса
        full_url = f"{provider.base_url.rstrip('/')}{ai_model.api_endpoint}"
        
        # Headers
        headers = {
            'Content-Type': 'application/json',
        }
        
        if provider.api_key:
            headers['Authorization'] = f'Bearer {provider.api_key}'
        
        logger.info("Отправка запроса на генерацию Element #%s URL=%s", element_id, full_url)
        
        # Отправляем запрос
        response = requests.post(
            full_url,
            json=request_body,
            headers=headers,
            timeout=30
        )
        
        response.raise_for_status()
        result = response.json()
        
        logger.info("Получен ответ от провайдера для Element #%s", element_id)
        
        # Проверка кода ответа
        code = result.get('code')
        if code != 200:
            error_msg = result.get('msg', 'Unknown error')
            raise ValueError(f"API error (code {code}): {error_msg}")
        
        # Извлекаем task_id (для Kie.ai это data.taskId)
        data = result.get('data')
        if not data:
            raise ValueError(f"Data отсутствует в ответе: {result}")
        
        task_id = data.get('taskId')
        
        if not task_id:
            raise ValueError(f"Task ID не найден в ответе: {result}")
        
        # Обновляем элемент
        element.external_task_id = task_id
        element.status = Element.STATUS_PROCESSING
        element.save()
        
        logger.info("Element #%s обновлен: task_id=%s, status=PROCESSING", element_id, task_id)
        
        # Запускаем polling задачу
        check_generation_status.apply_async(
            args=[element_id],
            countdown=10  # Начинаем проверку через 10 секунд
        )
        
        return {
            'element_id': element_id,
            'task_id': task_id,
            'status': 'processing'
        }
        
    except Retry:
        raise
    except Exception as e:
        logger.exception("Ошибка при запуске генерации Element #%s: %s", element_id, e)

        # Retry при сетевых ошибках: не переводим элемент в FAILED до исчерпания ретраев
        if isinstance(e, (requests.RequestException, requests.Timeout)):
            raise self.retry(exc=e, countdown=60)

        # Критическая ошибка — переводим в FAILED, делаем refund и уведомляем фронтенд
        try:
            element = Element.objects.get(id=element_id)
            # Возврат средств при ошибке провайдера
            _refund_for_failure(element)
            applied = finalize_generation_failure(element_id=element_id, error_message=str(e))
            if applied:
                notify_element_status(element, 'FAILED', error_message=str(e))
        except Element.DoesNotExist:
            pass

        raise


@shared_task(bind=True, max_retries=60)
def check_generation_status(self, element_id: int) -> dict:
    """
    Проверка статуса генерации через polling (GET /recordInfo).
    
    Args:
        element_id: ID элемента
    
    Returns:
        Статус генерации
    """
    try:
        element = Element.objects.select_related(
            'ai_model',
            'ai_model__provider'
        ).get(id=element_id)

        if element.status in (Element.STATUS_COMPLETED, Element.STATUS_FAILED):
            return {'element_id': element_id, 'status': element.status, 'skipped': True}
        
        if not element.external_task_id:
            raise ValueError("External task_id не найден")
        
        provider = element.ai_model.provider
        
        # URL для проверки статуса (Kie.ai: /api/v1/jobs/recordInfo)
        check_url = f"{provider.base_url.rstrip('/')}/api/v1/jobs/recordInfo"
        
        headers = {}
        if provider.api_key:
            headers['Authorization'] = f'Bearer {provider.api_key}'
        
        # Запрос статуса
        response = requests.get(
            check_url,
            params={'taskId': element.external_task_id},
            headers=headers,
            timeout=30
        )
        
        response.raise_for_status()
        result = response.json()
        
        data = result.get('data', {})
        state = data.get('state', '').lower()
        
        logger.info("Статус генерации Element #%s: %s", element_id, state)
        
        if state == 'success':
            source_url = extract_result_url(result)
            applied, s3_url = finalize_generation_success(element_id=element_id, source_url=source_url)
            if applied:
                updated_element = Element.objects.get(id=element_id)
                notify_element_status(updated_element, 'COMPLETED', file_url=s3_url)
            
            return {
                'element_id': element_id,
                'status': 'completed',
                'file_url': s3_url,
                'applied': applied,
            }
            
        elif state == 'failed':
            # Генерация failed
            fail_msg = data.get('failMsg', 'Unknown error')
            
            try:
                element = Element.objects.get(id=element_id)
                # Возврат средств при ошибке провайдера
                _refund_for_failure(element, reason=fail_msg)
            except Element.DoesNotExist:
                pass
            
            applied = finalize_generation_failure(element_id=element_id, error_message=fail_msg)
            if applied:
                updated_element = Element.objects.get(id=element_id)
                notify_element_status(updated_element, 'FAILED', error_message=fail_msg)
            logger.warning("Генерация failed для Element #%s: %s", element_id, fail_msg)
            
            return {
                'element_id': element_id,
                'status': 'failed',
                'error': fail_msg,
                'applied': applied,
            }
            
        else:
            # Еще в процессе (pending, processing, etc.)
            logger.info(
                "Генерация в процессе Element #%s: %s, повтор через 10 сек",
                element_id,
                state,
            )
            
            # Retry через 10 секунд
            raise self.retry(countdown=10, max_retries=60)
        
    except Retry:
        raise
    except Exception as e:
        logger.exception("Ошибка при проверке статуса Element #%s: %s", element_id, e)
        
        # Retry при сетевых ошибках
        if isinstance(e, (requests.RequestException, requests.Timeout)):
            raise self.retry(exc=e, countdown=10)
        
        # Обновляем статус элемента при критической ошибке
        try:
            applied = finalize_generation_failure(element_id=element_id, error_message=str(e))
            if applied:
                element = Element.objects.get(id=element_id)
                notify_element_status(element, 'FAILED', error_message=str(e))
        except Element.DoesNotExist:
            pass
        
        raise


@shared_task(bind=True, max_retries=3)
def process_uploaded_file(self, element_id: int, staging_path: str) -> dict:
    """
    FIFO-задача: загрузка файла из staging в S3 + генерация thumbnail.
    Вызывается из upload view вместо синхронной загрузки в S3.
    """
    try:
        element = Element.objects.select_related('scene', 'scene__project').get(id=element_id)

        file_url = upload_staging_to_s3(
            staging_path,
            project_id=element.scene.project_id,
            scene_id=element.scene_id,
        )

        element.file_url = file_url
        element.status = Element.STATUS_COMPLETED

        if element.element_type == Element.ELEMENT_TYPE_IMAGE:
            element.thumbnail_url = file_url
            element.save(update_fields=['file_url', 'thumbnail_url', 'status', 'updated_at'])
        elif element.element_type == Element.ELEMENT_TYPE_VIDEO:
            thumbnail_url = generate_video_thumbnail_from_path(
                staging_path,
                project_id=element.scene.project_id,
                scene_id=element.scene_id,
            )
            element.thumbnail_url = thumbnail_url or ''
            element.save(update_fields=['file_url', 'thumbnail_url', 'status', 'updated_at'])
        else:
            element.save(update_fields=['file_url', 'status', 'updated_at'])

        notify_element_status(element, 'COMPLETED', file_url=file_url)

        return {'element_id': element_id, 'status': 'completed', 'file_url': file_url}

    except Retry:
        raise
    except Exception as e:
        logger.exception("Ошибка обработки загруженного файла Element #%s: %s", element_id, e)
        try:
            element = Element.objects.get(id=element_id)
            element.status = Element.STATUS_FAILED
            element.error_message = str(e)
            element.save(update_fields=['status', 'error_message', 'updated_at'])
            notify_element_status(element, 'FAILED', error_message=str(e))
        except Element.DoesNotExist:
            pass

        if isinstance(e, (IOError, OSError)):
            raise self.retry(exc=e, countdown=30)
        raise
    finally:
        try:
            if staging_path and os.path.exists(staging_path):
                os.unlink(staging_path)
        except Exception:
            pass


@shared_task(bind=True, max_retries=3)
def generate_upload_thumbnail(self, element_id: int) -> dict:
    """
    Асинхронная генерация thumbnail для загруженного видео.
    """
    tmp_path = None
    try:
        import tempfile as _tempfile
        import os as _os

        element = Element.objects.select_related('scene', 'scene__project').get(id=element_id)

        if element.element_type != Element.ELEMENT_TYPE_VIDEO:
            return {'element_id': element_id, 'status': 'skipped', 'reason': 'not_video'}

        if not element.file_url:
            raise ValueError("У элемента отсутствует file_url для генерации превью")

        with _tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            with requests.get(element.file_url, timeout=120, stream=True) as r:
                r.raise_for_status()
                for chunk in r.iter_content(chunk_size=8192):
                    tmp.write(chunk)
            tmp_path = tmp.name

        thumbnail_url = generate_video_thumbnail_from_path(
            tmp_path,
            project_id=element.scene.project_id,
            scene_id=element.scene_id,
        )
        if not thumbnail_url:
            raise ValueError("Не удалось сгенерировать thumbnail для видео")

        element.thumbnail_url = thumbnail_url
        element.save(update_fields=['thumbnail_url', 'updated_at'])

        # Используем существующий websocket event для актуализации карточки
        notify_element_status(element, 'COMPLETED', file_url=element.file_url)

        return {
            'element_id': element_id,
            'status': 'completed',
            'thumbnail_url': thumbnail_url,
        }
    except Retry:
        raise
    except Exception as e:
        logger.exception("Ошибка генерации thumbnail для Element #%s: %s", element_id, e)
        if isinstance(e, (requests.RequestException, requests.Timeout)):
            raise self.retry(exc=e, countdown=30)
        return {
            'element_id': element_id,
            'status': 'failed',
            'error': str(e),
        }
    finally:
        try:
            if tmp_path and _os.path.exists(tmp_path):
                _os.unlink(tmp_path)
        except Exception:
            pass


def _refund_for_failure(element: Element, reason: str = "provider_error") -> None:
    """
    Выполнить возврат средств за генерацию при ошибке провайдера.
    
    Идемпотентна: повторный вызов не создаст двойной refund.
    """
    # Проверяем, что была операция списания
    generation_config = element.generation_config or {}
    debit_amount_str = generation_config.get('_debit_amount')
    
    if not debit_amount_str:
        # Не удалось определить сумму списания — не делаем refund
        logger.warning("Не удалось определить сумму списания для Element #%s", element.id)
        return
    
    try:
        amount = Decimal(debit_amount_str)
    except Exception:
        logger.error("Некорректная сумма списания '%s' для Element #%s", debit_amount_str, element.id)
        return
    
    # Получаем пользователя через сцену и проект
    user = element.scene.project.user
    
    # Выполняем refund
    credits_service = CreditsService()
    refund_result = credits_service.refund_for_generation(
        user=user,
        amount=amount,
        element=element,
        reason=CreditsTransaction.REASON_REFUND_PROVIDER_ERROR,
        metadata={
            "source": "provider_failure",
            "reason": reason,
            "original_debit": debit_amount_str,
        }
    )
    
    if refund_result.refunded:
        logger.info("Возврат средств выполнен для Element #%s: %s", element.id, amount)
    else:
        logger.info("Возврат средств пропущен (уже выполнен) для Element #%s", element.id)
