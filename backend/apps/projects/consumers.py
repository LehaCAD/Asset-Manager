"""
WebSocket consumer для проектов.
Клиент подключается к ws/projects/{project_id}/ и получает real-time обновления.
"""
import json
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser


class ProjectConsumer(AsyncJsonWebsocketConsumer):
    """
    Consumer для проекта. Клиент подключается и получает события:
    - asset_status_changed: статус ассета изменился (PROCESSING -> COMPLETED/FAILED)
    - new_comment: новый комментарий (V2)
    """

    async def connect(self):
        self.project_id = self.scope['url_route']['kwargs']['project_id']
        self.group_name = f'project_{self.project_id}'
        user = self.scope.get('user', AnonymousUser())

        # Проверяем аутентификацию
        if isinstance(user, AnonymousUser) or not user.is_authenticated:
            await self.close()
            return

        # Проверяем, что пользователь — владелец проекта
        is_owner = await self._check_project_owner(user, self.project_id)
        if not is_owner:
            await self.close()
            return

        # Подключаемся к группе проекта
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        # Отключаемся от группы
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        # Клиент может отправлять ping для поддержания соединения
        msg_type = content.get('type', '')
        if msg_type == 'ping':
            await self.send_json({'type': 'pong'})

    # --- Handlers для событий из Channel Layer ---

    async def asset_status_changed(self, event):
        """Обработчик события изменения статуса ассета."""
        await self.send_json({
            'type': 'asset_status_changed',
            'asset_id': event['asset_id'],
            'status': event['status'],
            'file_url': event.get('file_url', ''),
            'thumbnail_url': event.get('thumbnail_url', ''),
            'error_message': event.get('error_message', ''),
        })

    async def new_comment(self, event):
        """Обработчик события нового комментария (V2)."""
        await self.send_json({
            'type': 'new_comment',
            'comment': event['comment'],
        })

    # --- Helpers ---

    @database_sync_to_async
    def _check_project_owner(self, user, project_id: str) -> bool:
        """Проверяет, что пользователь — владелец проекта."""
        from apps.projects.models import Project
        return Project.objects.filter(id=project_id, user=user).exists()
