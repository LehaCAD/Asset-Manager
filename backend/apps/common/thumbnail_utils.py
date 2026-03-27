"""
DEPRECATED: This module has moved to apps.storage.
Import from apps.storage.services instead.

This stub exists for backward compatibility and will be removed.
"""
from apps.storage.thumbnails import (  # noqa: F401
    generate_thumbnails,
    _resize_to_fit,
    _generate_image_thumbnails,
    _generate_video_thumbnails,
    _save_thumbnail_to_s3,
    _upload_bytes_to_s3,
    SMALL_SIZE,
    MEDIUM_SIZE,
    SMALL_QUALITY,
    MEDIUM_QUALITY,
)
