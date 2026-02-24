"""
Celery tasks для работы с элементами.
"""
from celery import shared_task
import time
import requests
from typing import Optional
from django.core.files.base import ContentFile
from .models import Element
from .services import substitute_variables
from apps.scenes.s3_utils import upload_file_to_s3, generate_unique_filename


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
        print(f"⚠️ Не удалось отправить WebSocket-уведомление: {e}")


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
            'parent_element'
        ).get(id=element_id)
        
        if not element.ai_model:
            raise ValueError("AI модель не указана")
        
        ai_model = element.ai_model
        provider = ai_model.provider
        
        # Формируем context для подстановки переменных
        context = {
            'prompt': element.prompt_text or '',
            'model': ai_model.name,
        }
        
        # Добавляем параметры из generation_config
        if element.generation_config:
            context.update(element.generation_config)
        
        # Если есть родительский элемент (для img2vid) — передаем URL в input_urls
        if element.parent_element and element.parent_element.file_url:
            context['input_urls'] = [element.parent_element.file_url]
        else:
            context['input_urls'] = []
        
        # Подставляем переменные в request_schema
        request_body = substitute_variables(ai_model.request_schema, context)
        
        # URL для запроса
        full_url = f"{provider.base_url.rstrip('/')}{ai_model.api_endpoint}"
        
        # Headers
        headers = {
            'Content-Type': 'application/json',
        }
        
        if provider.api_key:
            headers['Authorization'] = f'Bearer {provider.api_key}'
        
        print(f"🚀 Отправка запроса на генерацию для Element #{element_id}")
        print(f"URL: {full_url}")
        print(f"Body: {request_body}")
        
        # Отправляем запрос
        response = requests.post(
            full_url,
            json=request_body,
            headers=headers,
            timeout=30
        )
        
        response.raise_for_status()
        result = response.json()
        
        print(f"✅ Ответ от провайдера: {result}")
        
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
        
        print(f"✅ Element #{element_id} обновлен: task_id={task_id}, status=PROCESSING")
        
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
        
    except Exception as e:
        print(f"❌ Ошибка при запуске генерации: {e}")
        
        # Обновляем статус элемента
        try:
            element = Element.objects.get(id=element_id)
            element.status = Element.STATUS_FAILED
            element.error_message = str(e)
            element.save()
            notify_element_status(element, 'FAILED', error_message=str(e))
        except Element.DoesNotExist:
            pass
        
        # Retry при сетевых ошибках
        if isinstance(e, (requests.RequestException, requests.Timeout)):
            raise self.retry(exc=e, countdown=60)
        
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
        
        print(f"📊 Статус генерации Element #{element_id}: {state}")
        
        if state == 'success':
            # Генерация завершена успешно
            result_json = data.get('resultJson', '{}')
            
            # Парсим resultJson (может быть строкой)
            if isinstance(result_json, str):
                import json
                result_data = json.loads(result_json)
            else:
                result_data = result_json
            
            # Получаем URL результата
            result_urls = result_data.get('resultUrls', [])
            
            if not result_urls:
                raise ValueError("Result URLs не найдены")
            
            file_url = result_urls[0]
            
            print(f"✅ Генерация завершена! Скачиваем файл: {file_url}")
            
            # Скачиваем файл
            file_response = requests.get(file_url, timeout=60)
            file_response.raise_for_status()
            
            # Определяем расширение из URL или Content-Type
            if file_url.endswith('.mp4'):
                ext = '.mp4'
            elif file_url.endswith('.jpg') or file_url.endswith('.jpeg'):
                ext = '.jpg'
            elif file_url.endswith('.png'):
                ext = '.png'
            else:
                ext = '.jpg'  # По умолчанию
            
            # Генерируем уникальное имя
            filename = generate_unique_filename(f"generated{ext}")
            
            # Создаем ContentFile для загрузки
            from django.core.files.uploadedfile import InMemoryUploadedFile
            from io import BytesIO
            
            file_content = BytesIO(file_response.content)
            file_content.seek(0)
            
            # Загружаем на S3
            from django.core.files.storage import default_storage
            file_path = f"generated/{filename}"
            saved_path = default_storage.save(file_path, ContentFile(file_response.content))
            s3_url = default_storage.url(saved_path)
            
            # Обновляем элемент
            element.file_url = s3_url
            element.status = Element.STATUS_COMPLETED
            element.save()
            
            # WebSocket-уведомление
            notify_element_status(element, 'COMPLETED', file_url=s3_url)
            
            print(f"✅ Element #{element_id} завершен! URL: {s3_url}")
            
            return {
                'element_id': element_id,
                'status': 'completed',
                'file_url': s3_url
            }
            
        elif state == 'failed':
            # Генерация failed
            fail_msg = data.get('failMsg', 'Unknown error')
            
            element.status = Element.STATUS_FAILED
            element.error_message = fail_msg
            element.save()
            
            # WebSocket-уведомление
            notify_element_status(element, 'FAILED', error_message=fail_msg)
            
            print(f"❌ Генерация failed: {fail_msg}")
            
            return {
                'element_id': element_id,
                'status': 'failed',
                'error': fail_msg
            }
            
        else:
            # Еще в процессе (pending, processing, etc.)
            print(f"⏳ Генерация в процессе: {state}, повторная проверка через 10 сек")
            
            # Retry через 10 секунд
            raise self.retry(countdown=10, max_retries=60)
        
    except Exception as e:
        print(f"❌ Ошибка при проверке статуса: {e}")
        
        # Retry при сетевых ошибках
        if isinstance(e, (requests.RequestException, requests.Timeout)):
            raise self.retry(exc=e, countdown=10)
        
        # Обновляем статус элемента при критической ошибке
        try:
            element = Element.objects.get(id=element_id)
            if element.status != Element.STATUS_COMPLETED:
                element.status = Element.STATUS_FAILED
                element.error_message = str(e)
                element.save()
        except Element.DoesNotExist:
            pass
        
        raise
