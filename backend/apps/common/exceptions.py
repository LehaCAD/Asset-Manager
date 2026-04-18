"""DRF exception handler — structured logging + stable error_id for clients.

4xx → WARNING with context, pass-through body.
5xx / non-DRF exceptions → ``logger.exception`` + generated ``error_id`` injected
into the response body and into Sentry scope tags so that the user-reported id
can be traced directly back to the log line.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_default_handler

logger = logging.getLogger(__name__)


def _coerce_body(data: Any, error_id: str, fallback: str) -> dict:
    """Normalize DRF's default body and always add error_id."""
    if isinstance(data, dict):
        body = dict(data)
        body.setdefault("error", body.get("detail") or fallback)
    else:
        body = {"error": str(data) if data is not None else fallback, "detail": data}
    body["error_id"] = error_id
    return body


def api_exception_handler(exc, context):
    response = drf_default_handler(exc, context)
    request = context.get("request") if isinstance(context, dict) else None
    view = context.get("view") if isinstance(context, dict) else None
    error_id = uuid.uuid4().hex

    meta = {
        "error_id": error_id,
        "exc_type": type(exc).__name__,
        "view": view.__class__.__name__ if view is not None else None,
        "path": getattr(request, "path", None),
        "method": getattr(request, "method", None),
    }

    if response is None:
        # DRF didn't know how to handle it → treat as 500.
        logger.exception("Unhandled API exception", extra=meta)
        _tag_sentry(error_id)
        return Response(
            {
                "error": "Внутренняя ошибка сервера",
                "error_id": error_id,
            },
            status=500,
        )

    status_code = response.status_code
    if status_code >= 500:
        logger.exception("API 5xx", extra={**meta, "status": status_code})
        _tag_sentry(error_id)
    elif status_code >= 400:
        logger.warning(
            "API %s: %s",
            status_code,
            type(exc).__name__,
            extra={**meta, "status": status_code},
        )

    response.data = _coerce_body(response.data, error_id, fallback="Ошибка запроса")
    return response


def _tag_sentry(error_id: str) -> None:
    try:
        import sentry_sdk  # noqa: WPS433 — optional dep
    except ImportError:
        return
    try:
        sentry_sdk.set_tag("error_id", error_id)
    except Exception:  # noqa: BLE001 — never let telemetry crash the response
        logger.debug("Sentry tagging failed", exc_info=True)
