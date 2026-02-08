"""
Утилиты для работы с S3 хранилищем.
"""
import os
import uuid
from typing import Tuple
from django.core.files.uploadedfile import UploadedFile
from django.core.files.storage import default_storage


def get_file_extension(filename: str) -> str:
    """Получить расширение файла."""
    return os.path.splitext(filename)[1].lower()


def detect_asset_type(filename: str) -> str:
    """
    Определить тип ассета по расширению файла.
    
    Returns:
        'IMAGE' или 'VIDEO'
    """
    from apps.assets.models import Asset
    
    ext = get_file_extension(filename)
    
    # Расширения изображений
    image_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']
    # Расширения видео
    video_extensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv']
    
    if ext in image_extensions:
        return Asset.ASSET_TYPE_IMAGE
    elif ext in video_extensions:
        return Asset.ASSET_TYPE_VIDEO
    else:
        # По умолчанию считаем изображением
        return Asset.ASSET_TYPE_IMAGE


def generate_unique_filename(original_filename: str) -> str:
    """
    Сгенерировать уникальное имя файла.
    
    Args:
        original_filename: оригинальное имя файла
    
    Returns:
        Уникальное имя файла с сохранением расширения
    """
    ext = get_file_extension(original_filename)
    unique_name = f"{uuid.uuid4().hex}{ext}"
    return unique_name


def upload_file_to_s3(file: UploadedFile, folder: str = 'uploads') -> Tuple[str, str]:
    """
    Загрузить файл на S3 и вернуть URL.
    
    Args:
        file: загруженный файл (Django UploadedFile)
        folder: папка для сохранения (по умолчанию 'uploads')
    
    Returns:
        Tuple[file_url, filename] - URL файла на S3 и имя файла
    """
    # Генерируем уникальное имя файла
    filename = generate_unique_filename(file.name)
    
    # Формируем путь: folder/filename
    file_path = f"{folder}/{filename}"
    
    # Сохраняем файл через django-storages (автоматически на S3)
    saved_path = default_storage.save(file_path, file)
    
    # Получаем публичный URL
    file_url = default_storage.url(saved_path)
    
    return file_url, filename


def delete_file_from_s3(file_url: str) -> bool:
    """
    Удалить файл из S3 по URL.
    
    Args:
        file_url: URL файла на S3
    
    Returns:
        True если успешно удалено, False иначе
    """
    try:
        # Извлекаем путь из URL
        # Например: https://bucket.s3.timeweb.com/media/uploads/abc123.jpg -> uploads/abc123.jpg
        if '/media/' in file_url:
            file_path = file_url.split('/media/')[1]
        else:
            # Если формат URL другой, пытаемся извлечь последние части
            file_path = '/'.join(file_url.split('/')[-2:])
        
        # Удаляем файл
        if default_storage.exists(file_path):
            default_storage.delete(file_path)
            return True
        return False
    except Exception as e:
        print(f"Error deleting file from S3: {e}")
        return False
