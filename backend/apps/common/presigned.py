"""
DEPRECATED: This module has moved to apps.storage.
Import from apps.storage.services instead.

This stub exists for backward compatibility and will be removed.
"""
from apps.storage.presigned import (  # noqa: F401
    _get_s3_client,
    generate_upload_presigned_urls,
    head_s3_object,
    get_public_url,
    _get_extension,
    PRESIGN_TTL,
    EXTENSION_TO_CONTENT_TYPE,
)
