"""
DEPRECATED: This module has moved to apps.storage.
Import from apps.storage.services instead.

This stub exists for backward compatibility and will be removed.
"""
from apps.storage.s3 import (  # noqa: F401
    get_file_extension,
    detect_element_type,
    validate_file_type,
    delete_file_from_s3,
    save_to_staging,
    upload_staging_to_s3,
    STAGING_DIR,
)
