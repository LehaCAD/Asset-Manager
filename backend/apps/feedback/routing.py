"""
WebSocket URL routing для feedback conversations.
"""
from django.urls import re_path
from .consumers import FeedbackChatConsumer

websocket_urlpatterns = [
    re_path(r'ws/feedback/(?P<conversation_id>\d+)/$', FeedbackChatConsumer.as_asgi()),
]
