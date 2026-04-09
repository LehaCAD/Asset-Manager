"""
WebSocket consumer for feedback conversations.
Handles real-time message delivery and conversation updates.
"""
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Conversation


class FeedbackChatConsumer(AsyncJsonWebsocketConsumer):
    """WebSocket consumer for feedback chat conversations."""

    async def connect(self):
        """Accept connection and join conversation group."""
        self.conversation_id = self.scope["url_route"]["kwargs"]["conversation_id"]
        self.group_name = f"feedback_{self.conversation_id}"
        user = self.scope.get("user")

        if not user or user.is_anonymous:
            await self.close()
            return

        # Check access: conversation owner or staff
        has_access = await self._check_access(user)
        if not has_access:
            await self.close()
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        """Leave conversation group on disconnect."""
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def new_message(self, event):
        """Handle new message event."""
        await self.send_json(event)

    async def attachment_ready(self, event):
        """Handle attachment ready event."""
        await self.send_json(event)

    async def conversation_updated(self, event):
        """Handle conversation updated event."""
        await self.send_json(event)

    async def reward_granted(self, event):
        """Handle reward granted event."""
        await self.send_json(event)

    @database_sync_to_async
    def _check_access(self, user):
        """Check if user has access to conversation."""
        if user.is_staff:
            return Conversation.objects.filter(id=self.conversation_id).exists()
        return Conversation.objects.filter(id=self.conversation_id, user=user).exists()
