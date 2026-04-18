"""Logging filter that decorates every record with correlation context."""
from __future__ import annotations

import logging

from apps.common.logging_context import snapshot


class ContextFilter(logging.Filter):
    """Adds request_id / task_id / user_id / path / method to every record."""

    def filter(self, record: logging.LogRecord) -> bool:
        for key, value in snapshot().items():
            setattr(record, key, value)
        # Always expose these attributes so formatters never KeyError.
        for key in ("request_id", "user_id", "path", "method", "task_id", "task_name"):
            if not hasattr(record, key):
                setattr(record, key, None)
        return True
