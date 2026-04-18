"""Celery signal handlers — propagate correlation context + log failures."""
from __future__ import annotations

import logging

from celery.signals import task_failure, task_postrun, task_prerun

from apps.common import logging_context

logger = logging.getLogger(__name__)

_task_tokens: dict[str, dict] = {}


@task_prerun.connect
def _on_task_prerun(task_id=None, task=None, args=None, kwargs=None, **_):
    request_id = None
    if isinstance(kwargs, dict):
        request_id = kwargs.get("_request_id")
    tokens = logging_context.bind(
        task_id=task_id,
        task_name=getattr(task, "name", None),
        request_id=request_id,
    )
    if task_id:
        _task_tokens[task_id] = tokens


@task_postrun.connect
def _on_task_postrun(task_id=None, **_):
    tokens = _task_tokens.pop(task_id, None)
    if tokens is not None:
        logging_context.clear(tokens)


@task_failure.connect
def _on_task_failure(task_id=None, exception=None, einfo=None, sender=None, **_):
    task_name = getattr(sender, "name", None)
    logger.exception(
        "Celery task failed: %s",
        task_name or "<unknown>",
        extra={
            "task_id": task_id,
            "task_name": task_name,
            "exc_type": type(exception).__name__ if exception else None,
        },
        exc_info=exception if exception else True,
    )
