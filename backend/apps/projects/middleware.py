"""
JWT-аутентификация для WebSocket-соединений.
Токен передается в query string: ws://host/ws/projects/1/?token=<jwt_access_token>
"""
from urllib.parse import parse_qs
from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken
from django.contrib.auth import get_user_model

User = get_user_model()


@database_sync_to_async
def get_user_from_token(token_str: str):
    """Получить пользователя по JWT access-токену."""
    try:
        token = AccessToken(token_str)
        user_id = token['user_id']
        return User.objects.get(id=user_id)
    except Exception:
        return AnonymousUser()


@database_sync_to_async
def get_user_from_session(scope):
    """Получить пользователя из Django session (для admin WebSocket)."""
    try:
        from django.contrib.sessions.models import Session
        # ASGI headers: list of (name: bytes, value: bytes) tuples
        cookie_header = b''
        for header_name, header_value in scope.get('headers', []):
            if header_name == b'cookie':
                cookie_header = header_value
                break
        if not cookie_header:
            return AnonymousUser()
        # Parse "sessionid=abc123; csrftoken=xyz; ..."
        cookies = {}
        for part in cookie_header.decode().split(';'):
            part = part.strip()
            if '=' in part:
                k, v = part.split('=', 1)
                cookies[k.strip()] = v.strip()
        session_key = cookies.get('sessionid', '')
        if not session_key:
            return AnonymousUser()
        session = Session.objects.get(session_key=session_key)
        uid = session.get_decoded().get('_auth_user_id')
        if uid:
            return User.objects.get(id=uid)
    except Exception:
        pass
    return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    """
    Middleware для аутентификации WebSocket через JWT или Django session.

    JWT (frontend):  ws://host/ws/projects/1/?token=eyJ...
    Session (admin): ws://host/ws/feedback/1/ (uses sessionid cookie)
    """

    async def __call__(self, scope, receive, send):
        query_string = parse_qs(scope.get('query_string', b'').decode())
        token_list = query_string.get('token', [])

        if token_list:
            scope['user'] = await get_user_from_token(token_list[0])
        else:
            # Fallback to Django session auth (for admin interface)
            scope['user'] = await get_user_from_session(scope)

        return await super().__call__(scope, receive, send)
