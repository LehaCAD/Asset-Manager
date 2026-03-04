"""
Утилиты для работы с S3 хранилищем.
"""
import os
import uuid
import tempfile
import subprocess
from typing import Tuple, Optional
from django.core.files.uploadedfile import UploadedFile
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile


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


def upload_file_to_s3(file: UploadedFile, folder: str = 'uploads', project_id: int = None, scene_id: int = None) -> Tuple[str, str]:
    """
    Загрузить файл на S3 и вернуть URL.
    
    Args:
        file: загруженный файл (Django UploadedFile)
        folder: папка для сохранения (по умолчанию 'uploads'). 
                Если указаны project_id и scene_id, используется структурированная папка.
        project_id: ID проекта (опционально, для структурированного хранения)
        scene_id: ID сцены (опционально, для структурированного хранения)
    
    Returns:
        Tuple[file_url, filename] - URL файла на S3 и имя файла
    """
    # Генерируем уникальное имя файла с оригинальным расширением
    ext = get_file_extension(file.name)
    base_name = os.path.splitext(file.name)[0]
    # Создаём slug из имени файла (простая версия)
    slug = ''.join(c if c.isalnum() or c in '-_' else '_' for c in base_name)[:50]
    unique_id = uuid.uuid4().hex[:8]
    filename = f"{unique_id}_{slug}{ext}"
    
    # Формируем путь в зависимости от наличия project_id и scene_id
    if project_id and scene_id:
        # Структурированная папка: projects/{project_id}/scenes/{scene_id}/
        file_path = f"projects/{project_id}/scenes/{scene_id}/{filename}"
    else:
        # Старая структура для обратной совместимости
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


def generate_video_thumbnail(file: UploadedFile, project_id: int, scene_id: int) -> Optional[str]:
    """
    Сгенерировать превью для видео файла используя ffmpeg.
    
    Args:
        file: загруженный видео файл
        project_id: ID проекта
        scene_id: ID сцены
    
    Returns:
        URL превью или None в случае ошибки
    """
    try:
        # Создаем временные файлы для входного видео и выходного изображения
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as temp_video:
            # Сохраняем загруженное видео во временный файл
            for chunk in file.chunks():
                temp_video.write(chunk)
            temp_video_path = temp_video.name
        
        # Создаем временный файл для превью
        temp_thumbnail_path = tempfile.mktemp(suffix='.jpg')
        
        try:
            # Запускаем ffmpeg для извлечения первого кадра
            subprocess.run([
                'ffmpeg',
                '-i', temp_video_path,
                '-vframes', '1',
                '-f', 'image2',
                '-y',  # Перезаписать выходной файл если существует
                temp_thumbnail_path
            ], check=True, capture_output=True)
            
            # Читаем сгенерированное превью
            with open(temp_thumbnail_path, 'rb') as thumbnail_file:
                thumbnail_content = thumbnail_file.read()
            
            # Генерируем уникальное имя для превью
            thumbnail_filename = f"{uuid.uuid4().hex}_thumb.jpg"
            thumbnail_path = f"projects/{project_id}/scenes/{scene_id}/{thumbnail_filename}"
            
            # Загружаем превью на S3
            saved_path = default_storage.save(thumbnail_path, ContentFile(thumbnail_content))
            thumbnail_url = default_storage.url(saved_path)
            
            return thumbnail_url
            
        finally:
            # Удаляем временные файлы
            if os.path.exists(temp_video_path):
                os.unlink(temp_video_path)
            if os.path.exists(temp_thumbnail_path):
                os.unlink(temp_thumbnail_path)
    
    except Exception as e:
        print(f"Error generating video thumbnail: {e}")
        return None


def generate_video_thumbnail_from_path(
    video_path: str, project_id: int, scene_id: int
) -> Optional[str]:
    """
    Сгенерировать превью для видео из файла на диске (для async-задач).
    Не загружает видео в RAM — работает напрямую с файлом через ffmpeg.

    Args:
        video_path: путь к видео файлу на диске
        project_id: ID проекта
        scene_id: ID сцены

    Returns:
        URL превью или None в случае ошибки
    """
    temp_thumbnail_path = tempfile.mktemp(suffix=".jpg")
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-i",
                video_path,
                "-vframes",
                "1",
                "-f",
                "image2",
                "-y",
                temp_thumbnail_path,
            ],
            check=True,
            capture_output=True,
        )

        with open(temp_thumbnail_path, "rb") as thumbnail_file:
            thumbnail_content = thumbnail_file.read()

        thumbnail_filename = f"{uuid.uuid4().hex}_thumb.jpg"
        thumbnail_path = (
            f"projects/{project_id}/scenes/{scene_id}/{thumbnail_filename}"
        )
        saved_path = default_storage.save(
            thumbnail_path, ContentFile(thumbnail_content)
        )
        return default_storage.url(saved_path)
    except Exception as e:
        print(f"Error generating video thumbnail from path: {e}")
        return None
    finally:
        if os.path.exists(temp_thumbnail_path):
            os.unlink(temp_thumbnail_path)


def generate_video_thumbnail_from_bytes(
    video_bytes: bytes, project_id: int, scene_id: int
) -> Optional[str]:
    """
    Сгенерировать превью для видео из набора байт.
    Обёртка над generate_video_thumbnail_from_path для обратной совместимости.
    """
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as temp_video:
            temp_video.write(video_bytes)
            temp_video_path = temp_video.name

        try:
            return generate_video_thumbnail_from_path(
                temp_video_path, project_id, scene_id
            )
        finally:
            if os.path.exists(temp_video_path):
                os.unlink(temp_video_path)
    except Exception as e:
        print(f"Error generating video thumbnail from bytes: {e}")
        return None
