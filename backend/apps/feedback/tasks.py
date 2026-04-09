import io
import logging
import uuid
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.utils import timezone
from PIL import Image

from .models import Attachment, Message
from .utils import get_s3_client

logger = logging.getLogger(__name__)

MAX_DIMENSION = 800
JPEG_QUALITY = 85


@shared_task(bind=True, max_retries=3, soft_time_limit=60)
def process_feedback_attachment(
    self, conversation_id, message_id, tmp_file_key, file_name, content_type,
):
    """Скачать из S3 tmp, resize, upload в final, удалить tmp."""
    s3 = get_s3_client()
    bucket = settings.AWS_STORAGE_BUCKET_NAME

    try:
        # Скачать из tmp
        response = s3.get_object(Bucket=bucket, Key=tmp_file_key)
        data = response["Body"].read()

        # Валидация MIME по magic bytes
        import magic
        detected_mime = magic.from_buffer(data[:2048], mime=True)
        allowed_mimes = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
        if detected_mime not in allowed_mimes:
            logger.warning("Rejected feedback attachment: detected MIME %s", detected_mime)
            s3.delete_object(Bucket=bucket, Key=tmp_file_key)
            return

        is_image = detected_mime.startswith("image/")

        if is_image:
            # Resize
            img = Image.open(io.BytesIO(data))
            img = img.convert("RGB")

            w, h = img.size
            if max(w, h) > MAX_DIMENSION:
                ratio = MAX_DIMENSION / max(w, h)
                img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
            buf.seek(0)
            processed_data = buf.read()
            final_ext = ".jpg"
            final_ct = "image/jpeg"
        else:
            # PDF: as-is
            processed_data = data
            final_ext = ".pdf"
            final_ct = "application/pdf"

        # Upload to final path
        final_key = f"feedback/{conversation_id}/{uuid.uuid4()}{final_ext}"
        s3.put_object(
            Bucket=bucket,
            Key=final_key,
            Body=processed_data,
            ContentType=final_ct,
        )

        # Delete tmp
        s3.delete_object(Bucket=bucket, Key=tmp_file_key)

        # Create Attachment record
        msg = Message.objects.get(id=message_id)
        attachment = Attachment.objects.create(
            message=msg,
            file_key=final_key,
            file_name=file_name,
            file_size=len(processed_data),
            content_type=final_ct,
        )

        # Generate presigned GET URL for the processed attachment
        presigned_url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": final_key},
            ExpiresIn=3600,
        )

        # Notify via WS
        from .services import notify_attachment_ready
        notify_attachment_ready(conversation_id, message_id, {
            "id": attachment.id,
            "file_name": attachment.file_name,
            "file_size": attachment.file_size,
            "content_type": attachment.content_type,
            "is_expired": False,
            "created_at": attachment.created_at.isoformat(),
            "url": presigned_url,
        })

        logger.info("Feedback attachment processed: %s → %s", tmp_file_key, final_key)

    except Exception as exc:
        logger.exception("Failed to process feedback attachment: %s", tmp_file_key)
        raise self.retry(exc=exc, countdown=30)


@shared_task
def cleanup_feedback_tmp():
    """Удалить файлы в feedback/tmp/ старше 1 часа."""
    s3 = get_s3_client()
    bucket = settings.AWS_STORAGE_BUCKET_NAME
    cutoff = timezone.now() - timedelta(hours=1)

    response = s3.list_objects_v2(Bucket=bucket, Prefix="feedback/tmp/")
    deleted = 0

    for obj in response.get("Contents", []):
        if obj["LastModified"] < cutoff:
            s3.delete_object(Bucket=bucket, Key=obj["Key"])
            deleted += 1

    if deleted:
        logger.info("Cleaned up %d stale feedback tmp files", deleted)


@shared_task
def cleanup_old_attachments():
    """Удалить вложения старше 90 дней, пометить is_expired."""
    cutoff = timezone.now() - timedelta(days=90)
    attachments = Attachment.objects.filter(created_at__lt=cutoff, is_expired=False)

    s3 = get_s3_client()
    bucket = settings.AWS_STORAGE_BUCKET_NAME
    count = 0

    for att in attachments:
        try:
            s3.delete_object(Bucket=bucket, Key=att.file_key)
        except Exception:
            logger.warning("Failed to delete S3 key: %s", att.file_key)
        att.is_expired = True
        att.file_key = ""
        att.save(update_fields=["is_expired", "file_key"])
        count += 1

    if count:
        logger.info("Expired %d old feedback attachments", count)
