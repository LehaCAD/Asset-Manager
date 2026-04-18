"""Correlation context for structured logging.

Stores request_id / task_id / user_id in contextvars so that every log record
(anywhere in the call stack) can be decorated with them automatically via
``ContextFilter``.
"""
from __future__ import annotations

import contextvars
from typing import Any

_request_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("request_id", default=None)
_user_id: contextvars.ContextVar[int | None] = contextvars.ContextVar("user_id", default=None)
_path: contextvars.ContextVar[str | None] = contextvars.ContextVar("path", default=None)
_method: contextvars.ContextVar[str | None] = contextvars.ContextVar("method", default=None)
_task_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("task_id", default=None)
_task_name: contextvars.ContextVar[str | None] = contextvars.ContextVar("task_name", default=None)


def bind(**fields: Any) -> dict[str, contextvars.Token]:
    """Set context fields. Returns tokens so callers can later ``clear``."""
    tokens: dict[str, contextvars.Token] = {}
    mapping = {
        "request_id": _request_id,
        "user_id": _user_id,
        "path": _path,
        "method": _method,
        "task_id": _task_id,
        "task_name": _task_name,
    }
    for key, value in fields.items():
        var = mapping.get(key)
        if var is None:
            continue
        tokens[key] = var.set(value)
    return tokens


def clear(tokens: dict[str, contextvars.Token] | None = None) -> None:
    """Reset specific tokens or every context var if tokens is None."""
    if tokens:
        mapping = {
            "request_id": _request_id,
            "user_id": _user_id,
            "path": _path,
            "method": _method,
            "task_id": _task_id,
            "task_name": _task_name,
        }
        for key, token in tokens.items():
            var = mapping.get(key)
            if var is not None:
                try:
                    var.reset(token)
                except ValueError:
                    var.set(None)  # token from a different context
        return
    for var in (_request_id, _user_id, _path, _method, _task_id, _task_name):
        var.set(None)


def snapshot() -> dict[str, Any]:
    """Return the current context as a plain dict (omitting None)."""
    data = {
        "request_id": _request_id.get(),
        "user_id": _user_id.get(),
        "path": _path.get(),
        "method": _method.get(),
        "task_id": _task_id.get(),
        "task_name": _task_name.get(),
    }
    return {k: v for k, v in data.items() if v is not None}


def get_request_id() -> str | None:
    return _request_id.get()
