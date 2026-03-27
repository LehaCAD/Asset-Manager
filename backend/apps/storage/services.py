"""
Storage module — public interface.

All external modules should import from here, not from internal files.
Owns: S3 operations, presigned URLs, thumbnails, file validation, staging.
"""

# S3 operations
from apps.storage.s3 import (
    get_file_extension,
    detect_element_type,
    validate_file_type,
    delete_file_from_s3,
    save_to_staging,
    upload_staging_to_s3,
    ELEMENT_TYPE_IMAGE,
    ELEMENT_TYPE_VIDEO,
)

# Presigned URLs
from apps.storage.presigned import (
    generate_upload_presigned_urls,
    head_s3_object,
    get_public_url,
)

# Thumbnails
from apps.storage.thumbnails import (
    generate_thumbnails,
)

__all__ = [
    # S3
    'get_file_extension',
    'detect_element_type',
    'validate_file_type',
    'delete_file_from_s3',
    'save_to_staging',
    'upload_staging_to_s3',
    'ELEMENT_TYPE_IMAGE',
    'ELEMENT_TYPE_VIDEO',
    # Presigned
    'generate_upload_presigned_urls',
    'head_s3_object',
    'get_public_url',
    # Thumbnails
    'generate_thumbnails',
]
