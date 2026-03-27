"""
Notifications module — public interface.

Owns: WebSocket notifications for element status changes.
Zero domain model imports — receives data as arguments.
"""
import logging

logger = logging.getLogger(__name__)


def notify_element_status(
    element, status: str, file_url: str = '', error_message: str = '',
    preview_url: str = '', upload_progress: int | None = None,
) -> None:
    """
    Отправить WebSocket-уведомление об изменении статуса элемента.

    Args:
        element: Element instance (uses .id, .project_id, .thumbnail_url, .preview_url)
        status: Новый статус ('PROCESSING', 'COMPLETED', 'FAILED', 'UPLOADING')
        file_url: URL файла (для COMPLETED)
        error_message: Сообщение об ошибке (для FAILED)
        preview_url: URL превью
        upload_progress: 0-100 реальный серверный прогресс
    """
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        channel_layer = get_channel_layer()
        if channel_layer is None:
            return

        project_id = element.project_id
        group_name = f'project_{project_id}'

        payload = {
            'type': 'element_status_changed',
            'element_id': element.id,
            'status': status,
            'file_url': file_url,
            'thumbnail_url': element.thumbnail_url or '',
            'preview_url': preview_url or element.preview_url or '',
            'error_message': error_message,
        }
        if upload_progress is not None:
            payload['upload_progress'] = upload_progress

        async_to_sync(channel_layer.group_send)(group_name, payload)
    except Exception as e:
        logger.exception("Не удалось отправить WebSocket-уведомление: %s", e)
