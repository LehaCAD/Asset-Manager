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


def upload_staging_to_s3(staging_path: str, project_id: int, scene_id: int) -> str:
    """
    Загрузить файл из staging-директории в S3.
    Возвращает публичный S3 URL.
    """
    from django.core.files import File

    filename = os.path.basename(staging_path)
    s3_key = f"projects/{project_id}/scenes/{scene_id}/{filename}"

    with open(staging_path, 'rb') as f:
        saved_path = default_storage.save(s3_key, File(f))

    return default_storage.url(saved_path)

