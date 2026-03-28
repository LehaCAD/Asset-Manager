from django.http import JsonResponse
from django.db import connection


def health_check(request):
    """GET /api/health/ — проверяет DB и Redis."""
    status = {'status': 'ok', 'checks': {}}
    all_ok = True

    # Database
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        status['checks']['database'] = 'ok'
    except Exception as e:
        status['checks']['database'] = str(e)
        all_ok = False

    # Redis
    try:
        from redis import Redis
        import os
        redis_url = os.getenv('CELERY_BROKER_URL', 'redis://redis:6379/0')
        r = Redis.from_url(redis_url)
        r.ping()
        status['checks']['redis'] = 'ok'
    except Exception as e:
        status['checks']['redis'] = str(e)
        all_ok = False

    if not all_ok:
        status['status'] = 'error'
        return JsonResponse(status, status=503)
    return JsonResponse(status)
