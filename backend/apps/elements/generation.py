"""
Generation finalization and provider response handling.

Owns: download results, finalize success/failure, normalize provider responses.
Called by: elements/tasks.py (polling), elements/views_webhook.py (callback).
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
from typing import Any
from urllib.parse import urlparse

import requests
from django.utils import timezone

from apps.elements.models import Element
from apps.storage.services import upload_staging_to_s3, generate_thumbnails
from apps.notifications.services import notify_element_status

logger = logging.getLogger(__name__)


def is_public_callback_url(base_url: str) -> bool:
    """Return True when URL is public and can receive external callbacks."""
    if not base_url:
        return False

    parsed = urlparse(base_url)
    host = (parsed.hostname or "").lower()
    if not host:
        return False

    return host not in {"localhost", "127.0.0.1", "0.0.0.0", "::1"}


def _resolve_path(obj: Any, path: str) -> Any:
    """
    Resolve a dot-separated path on a nested dict/list.
    Example: _resolve_path({"data": {"response": {"resultUrls": ["url"]}}}, "data.response.resultUrls.0")
    """
    for part in path.split('.'):
        if obj is None:
            return None
        if isinstance(obj, dict):
            obj = obj.get(part)
        elif isinstance(obj, list):
            try:
                obj = obj[int(part)]
            except (ValueError, IndexError):
                return None
        else:
            return None
    return obj


def normalize_provider_response(payload: dict[str, Any], response_mapping: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Normalize provider response using a configurable mapping.

    response_mapping fields:
        state_path:      dot-path to status field (default: "data.state")
        success_value:   value meaning success (default: "success")
        failed_values:   list of values meaning failed (default: ["failed"])
        result_url_path: dot-path to first result URL (default: "data.resultJson.resultUrls.0")
        error_path:      dot-path to error message (default: "data.failMsg")

    Returns: {"state": "success"|"failed"|"processing", "result_url": str|None, "error": str|None}
    """
    mapping = response_mapping or {}

    state_path = mapping.get('state_path', 'data.state')
    raw_state = _resolve_path(payload, state_path)

    mapping_error = None
    if mapping and raw_state is None:
        mapping_error = f"response_mapping: поле '{state_path}' не найдено в ответе"

    success_value = mapping.get('success_value', 'success')
    failed_values = mapping.get('failed_values', ['failed', 'fail'])

    if raw_state == success_value or (isinstance(raw_state, str) and raw_state.lower() == str(success_value).lower()):
        state = 'success'
    elif raw_state in failed_values:
        state = 'failed'
    elif isinstance(raw_state, str) and raw_state.lower() in [str(v).lower() for v in failed_values]:
        state = 'failed'
    else:
        state = 'processing'

    code = payload.get('code')
    if code is not None and code != 200 and state == 'processing':
        state = 'failed'

    result_url = None
    if state == 'success':
        url_path = mapping.get('result_url_path', '')
        if url_path:
            result_url = _resolve_path(payload, url_path)
        if isinstance(result_url, str) and result_url.startswith('['):
            try:
                parsed = json.loads(result_url)
                result_url = parsed[0] if parsed else None
            except (json.JSONDecodeError, IndexError):
                pass
        if not result_url:
            try:
                result_url = extract_result_url(payload)
            except ValueError:
                pass

    error_path = mapping.get('error_path', 'data.failMsg')
    error = _resolve_path(payload, error_path)
    if not error and state == 'failed':
        error = payload.get('msg') or 'Generation failed'

    return {"state": state, "result_url": result_url, "error": error, "mapping_error": mapping_error}


def extract_result_url(payload: dict[str, Any]) -> str:
    """Extract first result URL from standard Kie.ai response payload."""
    data = payload.get("data", payload)
    result_json = data.get("resultJson")
    result_urls = data.get("resultUrls", [])

    if result_json:
        if isinstance(result_json, str):
            result_json = json.loads(result_json)
        if isinstance(result_json, dict):
            result_urls = result_json.get("resultUrls", result_urls)

    if not result_urls or not isinstance(result_urls, list):
        raise ValueError("Result URLs не найдены в ответе провайдера")

    first_url = result_urls[0]
    if not isinstance(first_url, str) or not first_url.strip():
        raise ValueError("Result URL пустой или невалидный")
    return first_url.strip()


def finalize_generation_success(element_id: int, source_url: str) -> tuple[bool, str]:
    """
    Download generated file and atomically persist COMPLETED status.

    Returns:
        (applied, file_url) where applied=False means another worker already finalized.
    """
    element = Element.objects.select_related("project", "scene").get(id=element_id)

    tmp_path = None
    try:
        notify_element_status(element, 'PROCESSING', upload_progress=0)
        file_url, file_size, tmp_path = _download_and_upload_result(
            source_url=source_url,
            project_id=element.project_id,
            scene_id=element.scene_id,
            on_progress=lambda pct: notify_element_status(
                element, 'PROCESSING', upload_progress=int(pct * 0.8),
            ),
        )

        notify_element_status(element, 'PROCESSING', upload_progress=80)
        thumbs = generate_thumbnails(
            tmp_path, element.element_type, element.project_id, element.scene_id,
        )
        notify_element_status(element, 'PROCESSING', upload_progress=95)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    update_payload: dict[str, Any] = {
        "status": Element.STATUS_COMPLETED,
        "file_url": file_url,
        "file_size": file_size,
        "error_message": "",
        "thumbnail_url": thumbs.get('thumbnail_url') or file_url,
        "preview_url": thumbs.get('preview_url', ''),
        "updated_at": timezone.now(),
    }

    updated = Element.objects.filter(
        id=element_id,
        status=Element.STATUS_PROCESSING,
    ).update(**update_payload)

    return updated > 0, file_url


def finalize_generation_failure(element_id: int, error_message: str) -> bool:
    """Atomically persist FAILED status if item is PENDING or PROCESSING."""
    updated = Element.objects.filter(
        id=element_id,
        status__in=(Element.STATUS_PENDING, Element.STATUS_PROCESSING),
    ).update(
        status=Element.STATUS_FAILED,
        error_message=error_message[:4000],
        updated_at=timezone.now(),
    )
    return updated > 0


def _download_and_upload_result(source_url: str, project_id: int, scene_id: int, on_progress=None) -> tuple[str, int, str]:
    """
    Stream file from provider to temp file and upload to S3.

    Returns (file_url, file_size, tmp_path).
    Caller is responsible for deleting tmp_path after use.
    """
    parsed_path = urlparse(source_url).path.lower()
    suffix = ".mp4" if parsed_path.endswith(".mp4") else ".jpg"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_file:
        tmp_path = tmp_file.name
        with requests.get(source_url, timeout=120, stream=True) as response:
            response.raise_for_status()
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    tmp_file.write(chunk)

    file_size = os.path.getsize(tmp_path)

    file_url = upload_staging_to_s3(
        staging_path=tmp_path,
        project_id=project_id,
        scene_id=scene_id,
        on_progress=on_progress,
    )
    return file_url, file_size, tmp_path
