"""WebSocket consumer для публичных ссылок.
Ревьюеры подключаются к ws/sharing/{token}/ и получают real-time обновления.
Аутентификация не требуется — UUID4 token является секретом.
"""
import logging
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async

logger = logging.getLogger(__name__)


class PublicShareConsumer(AsyncJsonWebsocketConsumer):
    """
    Анонимный consumer для ревьюеров на share page.
    Group: share_{token}
    Events: new_comment, reaction_updated, review_updated
    """

    async def connect(self):
        self.token = self.scope['url_route']['kwargs']['token']
        self.group_name = f'share_{self.token}'

        is_valid = await self._check_token(self.token)
        if not is_valid:
            await self.close()
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        msg_type = content.get('type', '')
        if msg_type == 'ping':
            await self.send_json({'type': 'pong'})

    # --- Event handlers from channel layer ---

    async def new_comment(self, event):
        """Forward new comment to all connected reviewers."""
        await self.send_json(event['data'])

    async def reaction_updated(self, event):
        """Forward reaction update to all connected reviewers."""
        await self.send_json(event['data'])

    async def review_updated(self, event):
        """Forward review update to all connected reviewers."""
        await self.send_json(event['data'])

    # --- Helpers ---

    @database_sync_to_async
    def _check_token(self, token):
        """Check that token exists and is not expired."""
        from .models import SharedLink
        try:
            link = SharedLink.objects.get(token=token)
            return not link.is_expired()
        except SharedLink.DoesNotExist:
            return False
