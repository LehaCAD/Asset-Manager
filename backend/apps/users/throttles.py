from rest_framework.throttling import AnonRateThrottle


class AuthRateThrottle(AnonRateThrottle):
    """5 requests/minute на auth-эндпоинты (login, register, refresh)."""
    scope = 'auth'


class WebhookRateThrottle(AnonRateThrottle):
    """30 requests/minute на webhook-эндпоинты (AI provider callbacks)."""
    scope = 'webhook'
