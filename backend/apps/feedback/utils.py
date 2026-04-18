"""
Re-export shared S3 client for backward compatibility.
Canonical source: apps.common.s3
"""
from apps.common.s3 import get_s3_client, get_bucket_name  # noqa: F401
