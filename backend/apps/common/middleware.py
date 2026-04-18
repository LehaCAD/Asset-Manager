"""Request-scoped middleware: correlation ID + unhandled exception logging."""
from __future__ import annotations

import logging
import uuid

from apps.common import logging_context

logger = logging.getLogger(__name__)

HEADER_NAME = "X-Request-ID"
_INCOMING_HEADER = "HTTP_X_REQUEST_ID"


class RequestIDMiddleware:
    """Generate (or reuse) a request id for every HTTP request.

    - reads incoming ``X-Request-ID`` when present, otherwise generates UUID4
    - binds ``request_id`` + ``user_id`` + ``path`` + ``method`` into logging contextvars
    - attaches ``request.request_id`` for view code
    - echoes the id back in the response header
    - logs unhandled exceptions with full context
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        incoming = request.META.get(_INCOMING_HEADER)
        request_id = incoming if incoming else uuid.uuid4().hex
        request.request_id = request_id

        user = getattr(request, "user", None)
        user_id = getattr(user, "id", None) if user is not None and getattr(user, "is_authenticated", False) else None

        tokens = logging_context.bind(
            request_id=request_id,
            user_id=user_id,
            path=request.path,
            method=request.method,
        )
        try:
            response = self.get_response(request)
            response[HEADER_NAME] = request_id
            return response
        finally:
            logging_context.clear(tokens)

    def process_exception(self, request, exception):
        logger.exception(
            "Unhandled exception in %s %s",
            request.method,
            request.path,
            extra={"exc_type": type(exception).__name__},
        )
        return None  # let Django's default handling kick in
