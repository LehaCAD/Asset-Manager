"""
Shared S3 client for all apps.
Single source of truth for boto3 client configuration.
"""
import boto3
from django.conf import settings


def get_s3_client():
    """Get configured boto3 S3 client."""
    return boto3.client(
        's3',
        endpoint_url=settings.AWS_S3_ENDPOINT_URL,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_S3_REGION_NAME,
    )


def get_bucket_name():
    """Get the configured S3 bucket name."""
    return settings.AWS_STORAGE_BUCKET_NAME
