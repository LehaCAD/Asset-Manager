"""
ASGI config for config project.
Supports both HTTP and WebSocket protocols.
"""

import os

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# Django ASGI application — must be initialized before importing consumers
django_asgi_app = get_asgi_application()

from apps.projects.routing import websocket_urlpatterns as project_ws  # noqa: E402
from apps.feedback.routing import websocket_urlpatterns as feedback_ws  # noqa: E402
from apps.sharing.routing import websocket_urlpatterns as sharing_ws  # noqa: E402
from apps.projects.middleware import JWTAuthMiddleware  # noqa: E402

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': JWTAuthMiddleware(
        URLRouter(project_ws + feedback_ws + sharing_ws)
    ),
})
