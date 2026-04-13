"""WebSocket URL routing для публичных ссылок."""
from django.urls import re_path
from .consumers import PublicShareConsumer

websocket_urlpatterns = [
    re_path(r'ws/sharing/(?P<token>[0-9a-f-]+)/$', PublicShareConsumer.as_asgi()),
]
