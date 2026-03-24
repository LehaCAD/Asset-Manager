"""
Утилиты для работы с S3 хранилищем.
"""
import os
import uuid
import logging
from urllib.parse import urlparse
from django.core.files.uploadedfile import UploadedFile
from django.core.files.storage import default_storage


def get_file_extension(filename: str) -> str:
    """Получить расширение файла."""
    return os.path.splitext(filename)[1].lower()


def detect_element_type(filename: str) -> str:
    """
    Определить тип элемента по расширению файла.
    
    Returns:
        'IMAGE' или 'VIDEO'
    """
    from apps.elements.models import Element
    
    ext = get_file_extension(filename)
    
    image_extensions = ['.jpg', '.jpeg', '.png']
    video_extensions = ['.mp4']
    
    if ext in image_extensions:
        return Element.ELEMENT_TYPE_IMAGE
    elif ext in video_extensions:
        return Element.ELEMENT_TYPE_VIDEO
    else:
        return Element.ELEMENT_TYPE_IMAGE


def validate_file_type(filename: str) -> bool:
    """
    Проверить, является ли файл допустимым типом.
    
    Returns:
        True если файл поддерживается, False иначе
    """
    ext = get_file_extension(filename)
    allowed_extensions = ['.jpg', '.jpeg', '.png', '.mp4']
    return ext in allowed_extensions


def delete_file_from_s3(file_url: str) -> bool:
    """
    Удалить файл из S3 по URL.
    
    Args:
        file_url: URL файла на S3
    
    Returns:
        True если успешно удалено, False иначе
    """
    logger = logging.getLogger(__name__)
    
    try:
        # Извлекаем путь из URL используя urlparse
        # Например: https://bucket.s3.timeweb.com/media/uploads/abc123.jpg -> media/uploads/abc123.jpg
        parsed = urlparse(file_url)
        path = parsed.path.lstrip('/')
        
        # Убираем prefix бакета/media если есть
        storage_location = getattr(default_storage, 'location', '').strip('/')
        if storage_location and path.startswith(storage_location + '/'):
            file_path = path[len(storage_location) + 1:]
        else:
            file_path = path
        
        # Логируем URL и вычисленный путь для отладки
        logger.info(f"Deleting file from S3: file_url={file_url}, computed file_path={file_path}")
        
        # Удаляем файл
        if default_storage.exists(file_path):
            default_storage.delete(file_path)
            logger.info(f"Successfully deleted file from S3: {file_path}")
            return True
        else:
            logger.warning(f"File not found in S3: {file_path}")
            return False
    except Exception as e:
        logger.error(f"Error deleting file from S3: file_url={file_url}, error={e}")
        return False


STAGING_DIR = '/app/tmp_uploads'


def save_to_staging(file: UploadedFile) -> str:
    """
    Быстро сохраняет загруженный файл в локальную staging-директорию.
    Возвращает полный путь к файлу.
    """
    os.makedirs(STAGING_DIR, exist_ok=True)
    ext = get_file_extension(file.name)
    unique_name = f"{uuid.uuid4().hex}{ext}"
    staging_path = os.path.join(STAGING_DIR, unique_name)

    with open(staging_path, 'wb') as dest:
        for chunk in file.chunks():
            dest.write(chunk)

    return staging_path


def upload_staging_to_s3(staging_path: str, project_id: int, scene_id: int, on_progress=None) -> str:
    """
    Загрузить файл из staging-директории в S3.
    on_progress(percent: int) — optional callback, 0-100.
    Возвращает публичный S3 URL.
    """
    from apps.common.presigned import _get_s3_client, get_public_url
    from django.conf import settings

    filename = os.path.basename(staging_path)
    s3_key = f"projects/{project_id}/scenes/{scene_id}/{filename}"
    file_size = os.path.getsize(staging_path)

    # Determine content type
    ext = os.path.splitext(filename)[1].lower()
    content_types = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4'}
    content_type = content_types.get(ext, 'application/octet-stream')

    if on_progress and file_size > 0:
        uploaded = 0
        last_reported = -1

        def progress_callback(bytes_transferred):
            nonlocal uploaded, last_reported
            uploaded += bytes_transferred
            pct = min(100, int(uploaded * 100 / file_size))
            if pct >= last_reported + 10:  # report every 10%
                last_reported = pct
                on_progress(pct)

        client = _get_s3_client()
        client.upload_file(
            staging_path,
            settings.AWS_STORAGE_BUCKET_NAME,
            s3_key,
            ExtraArgs={'ContentType': content_type},
            Callback=progress_callback,
        )
        return get_public_url(s3_key)
    else:
        from django.core.files import File
        with open(staging_path, 'rb') as f:
            default_storage.save(s3_key, File(f))
        return default_storage.url(s3_key)

