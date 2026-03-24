import uuid
import boto3
from django.conf import settings

PRESIGN_TTL = 900  # 15 minutes

EXTENSION_TO_CONTENT_TYPE = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
}


def _get_s3_client():
    """Dedicated boto3 client for presigned URLs (not default_storage)."""
    return boto3.client(
        's3',
        endpoint_url=settings.AWS_S3_ENDPOINT_URL,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_S3_REGION_NAME,
    )


def generate_upload_presigned_urls(
    project_id: int,
    scene_id: int | None,
    filename: str,
    element_type: str,
) -> dict:
    """
    Generate 3 presigned PUT URLs for original + small + medium.
    Returns: {upload_keys: {...}, presigned_urls: {...}, content_types: {...}}
    """
    client = _get_s3_client()
    bucket = settings.AWS_STORAGE_BUCKET_NAME

    ext = _get_extension(filename)
    uid = uuid.uuid4().hex

    # S3 key prefix
    if scene_id:
        prefix = f"projects/{project_id}/scenes/{scene_id}"
    else:
        prefix = f"projects/{project_id}/root"

    keys = {
        'original': f"{prefix}/{uid}{ext}",
        'small': f"{prefix}/{uid}_sm.jpg",
        'medium': f"{prefix}/{uid}_md.jpg",
    }

    # Content-Type for original derived from actual file extension
    original_ct = EXTENSION_TO_CONTENT_TYPE.get(ext, 'application/octet-stream')
    thumb_ct = 'image/jpeg'

    content_types = {}
    presigned_urls = {}
    for variant, key in keys.items():
        ct = original_ct if variant == 'original' else thumb_ct
        content_types[variant] = ct
        presigned_urls[variant] = client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': bucket,
                'Key': key,
                'ContentType': ct,
            },
            ExpiresIn=PRESIGN_TTL,
        )

    return {
        'upload_keys': keys,
        'presigned_urls': presigned_urls,
        'content_types': content_types,
        'expires_in': PRESIGN_TTL,
    }


def head_s3_object(key: str) -> dict | None:
    """HEAD request to verify object exists. Returns {size, content_type} or None."""
    client = _get_s3_client()
    try:
        resp = client.head_object(
            Bucket=settings.AWS_STORAGE_BUCKET_NAME,
            Key=key,
        )
        return {
            'size': resp['ContentLength'],
            'content_type': resp['ContentType'],
        }
    except client.exceptions.ClientError:
        return None


def get_public_url(key: str) -> str:
    """Build public URL for an S3 key."""
    domain = settings.AWS_S3_CUSTOM_DOMAIN
    return f"https://{domain}/{key}"


def _get_extension(filename: str) -> str:
    if '.' in filename:
        return '.' + filename.rsplit('.', 1)[1].lower()
    return ''
