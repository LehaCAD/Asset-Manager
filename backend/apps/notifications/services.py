"""
Notifications module — public interface.

Owns: WebSocket notifications for element status changes.
Zero domain model imports — receives data as arguments.
"""
import logging
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

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


def create_notification(user, type, project, title, message='', element=None, scene=None, comment=None):
    """Create persistent notification + send via user-scoped WebSocket."""
    from .models import Notification

    notification = Notification.objects.create(
        user=user,
        type=type,
        project=project,
        element=element,
        scene=scene,
        comment=comment,
        title=title,
        message=message,
    )

    try:
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f'user_{user.id}',
                {
                    'type': 'new_notification',
                    'notification': {
                        'id': notification.id,
                        'type': notification.type,
                        'title': notification.title,
                        'message': notification.message,
                        'project_id': project.id if project else None,
                        'element_id': element.id if element else None,
                        'scene_id': scene.id if scene else None,
                        'created_at': notification.created_at.isoformat(),
                    },
                },
            )
    except Exception as e:
        logger.warning(f'Failed to send WS notification: {e}')

    return notification


def notify_new_comment(comment, project):
    """Called when a reviewer or creator leaves a comment."""
    from .models import Notification

    owner = project.user
    if comment.author_user and comment.author_user == owner:
        return

    title = f'Новый комментарий от {comment.author_name}'
    message = comment.text[:100]

    create_notification(
        user=owner,
        type=Notification.Type.COMMENT_NEW,
        project=project,
        title=title,
        message=message,
        element=comment.element,
        scene=comment.scene,
        comment=comment,
    )

    try:
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f'project_{project.id}',
                {
                    'type': 'new_comment',
                    'comment': {
                        'id': comment.id,
                        'element_id': comment.element_id,
                        'scene_id': comment.scene_id,
                        'author_name': comment.author_name,
                        'text': comment.text[:100],
                        'created_at': comment.created_at.isoformat(),
                    },
                },
            )
    except Exception as e:
        logger.warning(f'Failed to send WS comment: {e}')
