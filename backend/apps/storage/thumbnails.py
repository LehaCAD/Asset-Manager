"""
Server-side thumbnail generation for AI-generated elements.
Used only in generation flow (server already has temp file).
Upload flow uses client-side Canvas resize.

Public interface — import from apps.storage.services instead.
"""
import logging
import os
import subprocess
import tempfile
from typing import Optional
import io
import uuid

from PIL import Image
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

logger = logging.getLogger(__name__)

SMALL_SIZE = 256
MEDIUM_SIZE = 800
SMALL_QUALITY = 80
MEDIUM_QUALITY = 85


def generate_thumbnails(
    temp_path: str,
    element_type: str,
    project_id: int,
    scene_id: int | None,
) -> dict:
    """
    Generate small + medium thumbnails from a local temp file.
    Returns: {'thumbnail_url': str, 'preview_url': str}
    Both may be '' on failure (never raises).
    """
    try:
        if element_type == 'IMAGE':
            return _generate_image_thumbnails(temp_path, project_id, scene_id)
        elif element_type == 'VIDEO':
            return _generate_video_thumbnails(temp_path, project_id, scene_id)
    except Exception as e:
        logger.exception("Thumbnail generation failed: %s", e)

    return {'thumbnail_url': '', 'preview_url': ''}


def _generate_image_thumbnails(
    image_path: str, project_id: int, scene_id: int | None,
) -> dict:
    """Resize image to small + medium using Pillow."""
    img = Image.open(image_path)
    img = img.convert('RGB')

    result = {}
    for variant, size, quality in [
        ('small', SMALL_SIZE, SMALL_QUALITY),
        ('medium', MEDIUM_SIZE, MEDIUM_QUALITY),
    ]:
        resized = _resize_to_fit(img, size)
        url = _save_thumbnail_to_s3(resized, quality, project_id, scene_id, variant)
        key = 'thumbnail_url' if variant == 'small' else 'preview_url'
        result[key] = url or ''

    return result


def _generate_video_thumbnails(
    video_path: str, project_id: int, scene_id: int | None,
) -> dict:
    """Extract frame via ffmpeg, then resize small. Medium = native frame."""
    frame_fd = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
    frame_path = frame_fd.name
    frame_fd.close()
    try:
        subprocess.run(
            [
                'ffmpeg', '-ss', '1', '-i', video_path,
                '-vframes', '1', '-q:v', '2', '-f', 'image2', '-y', frame_path,
            ],
            check=True, capture_output=True,
        )

        with open(frame_path, 'rb') as f:
            medium_content = f.read()
        medium_url = _upload_bytes_to_s3(medium_content, project_id, scene_id, 'md')

        img = Image.open(frame_path)
        img = img.convert('RGB')
        small_img = _resize_to_fit(img, SMALL_SIZE)
        small_url = _save_thumbnail_to_s3(small_img, SMALL_QUALITY, project_id, scene_id, 'small')

        return {
            'thumbnail_url': small_url or '',
            'preview_url': medium_url or '',
        }
    except Exception as e:
        logger.exception("Video thumbnail generation failed: %s", e)
        return {'thumbnail_url': '', 'preview_url': ''}
    finally:
        if os.path.exists(frame_path):
            os.unlink(frame_path)


def _resize_to_fit(img: Image.Image, max_side: int) -> Image.Image:
    """Resize image so longest side = max_side, preserving aspect ratio."""
    w, h = img.size
    if max(w, h) <= max_side:
        return img.copy()
    if w >= h:
        new_w = max_side
        new_h = int(h * max_side / w)
    else:
        new_h = max_side
        new_w = int(w * max_side / h)
    return img.resize((new_w, new_h), Image.LANCZOS)


def _save_thumbnail_to_s3(
    img: Image.Image, quality: int, project_id: int, scene_id: int | None, suffix: str,
) -> Optional[str]:
    """Save Pillow image to S3, return public URL."""
    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=quality)
    buffer.seek(0)

    prefix = f"projects/{project_id}/scenes/{scene_id}" if scene_id else f"projects/{project_id}/root"
    key = f"{prefix}/{uuid.uuid4().hex}_{suffix}.jpg"

    try:
        saved = default_storage.save(key, ContentFile(buffer.read()))
        return default_storage.url(saved)
    except Exception as e:
        logger.exception("Failed to upload thumbnail to S3: %s", e)
        return None


def _upload_bytes_to_s3(
    content: bytes, project_id: int, scene_id: int | None, suffix: str,
) -> Optional[str]:
    """Upload raw bytes to S3, return public URL."""
    prefix = f"projects/{project_id}/scenes/{scene_id}" if scene_id else f"projects/{project_id}/root"
    key = f"{prefix}/{uuid.uuid4().hex}_{suffix}.jpg"

    try:
        saved = default_storage.save(key, ContentFile(content))
        return default_storage.url(saved)
    except Exception as e:
        logger.exception("Failed to upload bytes to S3: %s", e)
        return None
