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
from apps.ai_providers.services import substitute_variables, collect_unresolved_placeholders, build_generation_context
import os
from decimal import Decimal

from apps.storage.services import upload_staging_to_s3, generate_thumbnails
from apps.elements.generation import (
    finalize_generation_failure,
    finalize_generation_success,
    is_public_callback_url,
    normalize_provider_response,
)
from apps.credits.models import CreditsTransaction
from apps.credits.services import CreditsService
from apps.ai_providers.validators import validate_model_admin_config

from apps.notifications.services import notify_element_status, create_notification

logger = logging.getLogger(__name__)


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
        
        # Polling: aggressive without callback, safety-net with callback
        has_callback = bool(callback_url)
        if has_callback:
            # Callback will deliver result. One safety-net poll after 2 min.
            check_generation_status.apply_async(
                args=[element_id],
                kwargs={'has_callback': True},
                countdown=120,
            )
        else:
            # No callback (e.g. localhost). Poll every 10s as before.
            check_generation_status.apply_async(
                args=[element_id],
                kwargs={'has_callback': False},
                countdown=10,
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
            element = Element.objects.select_related('project').get(id=element_id)
            # Возврат средств при ошибке провайдера
            _refund_for_failure(element)
            finalize_generation_failure(element_id=element_id, error_message=str(e))
            notify_element_status(element, 'FAILED', error_message=str(e))
        except Element.DoesNotExist:
            pass

        raise


@shared_task(bind=True, max_retries=60)  # Default for no-callback mode; overridden to 10 when has_callback=True
def check_generation_status(self, element_id: int, has_callback: bool = False) -> dict:
    """
    Проверка статуса генерации через polling (GET /recordInfo).

    With callback (production): sparse safety-net — 60s intervals, max 10 retries.
    Without callback (localhost): aggressive — 10s intervals, max 60 retries.

    Args:
        element_id: ID элемента
        has_callback: True if webhook callback is configured (reduces polling frequency)

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

        retry_count = self.request.retries or 0
        if retry_count == 0:
            mode = "callback-safety-net" if has_callback else "polling"
            logger.info(
                "check_generation_status Element #%s: mode=%s, interval=%ss, max_retries=%s",
                element_id, mode, 60 if has_callback else 10, 10 if has_callback else 60,
            )

        if not element.external_task_id:
            raise ValueError("External task_id не найден")
        
        provider = element.ai_model.provider
        response_mapping = element.ai_model.response_mapping or {}

        # URL для проверки статуса — из модели или дефолт
        status_endpoint = element.ai_model.status_check_endpoint
        if not status_endpoint:
            status_endpoint = '/api/v1/jobs/recordInfo'
        check_url = f"{provider.base_url.rstrip('/')}/{status_endpoint.lstrip('/')}"

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

        normalized = normalize_provider_response(result, response_mapping)
        state = normalized['state']

        if normalized.get('mapping_error'):
            logger.error(
                "Element #%s: %s. Raw: %s",
                element_id, normalized['mapping_error'], str(result)[:300],
            )

        logger.info("Статус генерации Element #%s: state=%s", element_id, state)

        if state == 'success':
            source_url = normalized.get('result_url')
            if not source_url:
                raise ValueError("Генерация завершена, но result_url пустой")

            applied, s3_url = finalize_generation_success(element_id=element_id, source_url=source_url)
            if applied:
                updated_element = Element.objects.get(id=element_id)
                notify_element_status(updated_element, 'COMPLETED', file_url=s3_url, preview_url=updated_element.preview_url)

            return {
                'element_id': element_id,
                'status': 'completed',
                'file_url': s3_url,
                'applied': applied,
            }

        elif state == 'failed':
            fail_msg = normalized.get('error') or 'Unknown error'

            try:
                element = Element.objects.select_related('project').get(id=element_id)
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
            retry_count = self.request.retries or 0

            # Первые 3 раза и потом каждые 10 — логируем raw ответ для дебага
            if retry_count < 3 or retry_count % 10 == 0:
                logger.info(
                    "Генерация в процессе Element #%s: state=%s, retry=%d, raw_data_keys=%s",
                    element_id, state, retry_count,
                    list((result.get('data') or {}).keys()),
                )

            # Если после 10 попыток state всё ещё не распознан —
            # скорее всего маппинг кривой (только в polling-режиме)
            if retry_count == 10 and not has_callback:
                logger.warning(
                    "Element #%s: 10 попыток, state=%s. Возможно кривой response_mapping. "
                    "Raw response: %s",
                    element_id, state, str(result)[:500],
                )

            retry_cd = 60 if has_callback else 10
            retry_max = 10 if has_callback else 60
            raise self.retry(countdown=retry_cd, max_retries=retry_max)
        
    except Retry:
        raise
    except Exception as e:
        logger.exception("Ошибка при проверке статуса Element #%s: %s", element_id, e)
        
        # Retry при сетевых ошибках
        if isinstance(e, (requests.RequestException, requests.Timeout)):
            retry_cd = 60 if has_callback else 10
            retry_max = 10 if has_callback else 60
            raise self.retry(exc=e, countdown=retry_cd, max_retries=retry_max)
        
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
        element = Element.objects.select_related('project', 'scene').get(id=element_id)

        # Step 1: Upload original to S3 (bulk of time — real progress via boto3 callback)
        notify_element_status(element, 'PROCESSING', upload_progress=0)
        file_url = upload_staging_to_s3(
            staging_path,
            project_id=element.project_id,
            scene_id=element.scene_id,
            on_progress=lambda pct: notify_element_status(
                element, 'PROCESSING', upload_progress=int(pct * 0.8),  # 0-80%
            ),
        )

        file_size = os.path.getsize(staging_path) if os.path.exists(staging_path) else None

        element.file_url = file_url
        element.file_size = file_size

        # Step 2: Generate thumbnails
        notify_element_status(element, 'PROCESSING', upload_progress=80)
        thumbs = generate_thumbnails(staging_path, element.element_type, element.project_id, element.scene_id)
        element.thumbnail_url = thumbs.get('thumbnail_url') or file_url
        element.preview_url = thumbs.get('preview_url') or ''
        notify_element_status(element, 'PROCESSING', upload_progress=95)

        # Step 3: Save and complete
        element.status = Element.STATUS_COMPLETED
        element.save(update_fields=['file_url', 'file_size', 'thumbnail_url', 'preview_url', 'status', 'updated_at'])

        notify_element_status(element, 'COMPLETED', file_url=file_url)

        try:
            create_notification(
                user=element.project.user,
                type='upload_completed',
                project=element.project,
                title='Файл загружен',
                message=element.original_filename or 'Загрузка завершена',
                element=element,
            )
        except Exception as e:
            logger.warning('Failed to create upload notification: %s', e)

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

        # Retry only transient I/O errors; skip permanent S3 errors
        # (UserSuspended, AccessDenied, etc.)
        err_str = str(e)
        permanent_s3 = any(code in err_str for code in (
            'UserSuspended', 'AccessDenied', 'InvalidAccessKeyId',
            'SignatureDoesNotMatch', 'AccountProblem',
        ))
        if isinstance(e, (IOError, OSError)) and not permanent_s3:
            raise self.retry(exc=e, countdown=30)
        raise
    finally:
        try:
            if staging_path and os.path.exists(staging_path):
                os.unlink(staging_path)
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
    
    # Получаем пользователя через проект
    user = element.project.user
    
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
