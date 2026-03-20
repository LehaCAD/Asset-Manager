"""Shared generation helpers for webhook and polling flows."""

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
from apps.scenes.s3_utils import upload_staging_to_s3

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


def extract_result_url(payload: dict[str, Any]) -> str:
    """Extract first result URL from Kie.ai response payload."""
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
    element = Element.objects.select_related("scene", "scene__project").get(id=element_id)
    file_url = _download_and_upload_result(
        source_url=source_url,
        project_id=element.scene.project_id,
        scene_id=element.scene_id,
    )

    update_payload: dict[str, Any] = {
        "status": Element.STATUS_COMPLETED,
        "file_url": file_url,
        "error_message": "",
        "updated_at": timezone.now(),
    }
    if element.element_type == Element.ELEMENT_TYPE_IMAGE:
        update_payload["thumbnail_url"] = file_url

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


def _download_and_upload_result(source_url: str, project_id: int, scene_id: int) -> str:
    """Stream file from provider to temp file and upload to S3."""
    parsed_path = urlparse(source_url).path.lower()
    suffix = ".mp4" if parsed_path.endswith(".mp4") else ".jpg"
    tmp_path = ""

    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_file:
            tmp_path = tmp_file.name
            with requests.get(source_url, timeout=120, stream=True) as response:
                response.raise_for_status()
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        tmp_file.write(chunk)

        return upload_staging_to_s3(
            staging_path=tmp_path,
            project_id=project_id,
            scene_id=scene_id,
        )
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError as exc:
                logger.warning("Не удалось удалить временный файл %s: %s", tmp_path, exc)
