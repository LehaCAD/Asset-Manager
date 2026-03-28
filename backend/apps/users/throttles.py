from rest_framework.throttling import AnonRateThrottle


class AuthRateThrottle(AnonRateThrottle):
    """5 requests/minute на auth-эндпоинты (login, register, refresh)."""
    scope = 'auth'
