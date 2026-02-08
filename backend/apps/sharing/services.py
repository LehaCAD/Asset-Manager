"""
Бизнес-логика для работы с публичными ссылками и комментариями.
"""
from typing import Optional, List
from datetime import datetime, timedelta
from django.utils import timezone
from apps.projects.models import Project
from apps.boxes.models import Box
from .models import SharedLink, Comment


def create_shared_link(
    project: Project,
    expires_in_days: Optional[int] = None
) -> SharedLink:
    """
    Создание публичной ссылки на проект.
    
    Args:
        project: Проект для публикации
        expires_in_days: Срок действия в днях (None = бессрочная)
        
    Returns:
        Созданная ссылка
    """
    expires_at = None
    if expires_in_days:
        expires_at = timezone.now() + timedelta(days=expires_in_days)
    
    link = SharedLink.objects.create(
        project=project,
        expires_at=expires_at
    )
    return link


def revoke_shared_link(link: SharedLink) -> None:
    """
    Отзыв публичной ссылки (удаление).
    
    Args:
        link: Ссылка для удаления
    """
    link.delete()


def get_project_by_token(token: str) -> Optional[Project]:
    """
    Получение проекта по токену публичной ссылки.
    
    Args:
        token: UUID токен ссылки
        
    Returns:
        Проект или None, если ссылка не найдена или истекла
    """
    try:
        link = SharedLink.objects.select_related('project').get(token=token)
        
        # Проверка срока действия
        if link.is_expired():
            return None
        
        return link.project
    except SharedLink.DoesNotExist:
        return None


def get_active_links(project: Project) -> List[SharedLink]:
    """
    Получение активных ссылок проекта.
    
    Args:
        project: Проект
        
    Returns:
        Список активных (не истекших) ссылок
    """
    all_links = project.shared_links.all()
    return [link for link in all_links if not link.is_expired()]


def create_comment(
    box: Box,
    author_name: str,
    text: str
) -> Comment:
    """
    Создание комментария к боксу.
    
    Args:
        box: Бокс
        author_name: Имя автора комментария
        text: Текст комментария
        
    Returns:
        Созданный комментарий
    """
    comment = Comment.objects.create(
        box=box,
        author_name=author_name,
        text=text
    )
    return comment


def mark_comment_as_read(comment: Comment) -> Comment:
    """
    Отметить комментарий как прочитанный.
    
    Args:
        comment: Комментарий
        
    Returns:
        Обновленный комментарий
    """
    comment.is_read = True
    comment.save()
    return comment


def get_box_comments(box: Box, unread_only: bool = False) -> List[Comment]:
    """
    Получение комментариев бокса.
    
    Args:
        box: Бокс
        unread_only: Только непрочитанные
        
    Returns:
        Список комментариев
    """
    queryset = Comment.objects.filter(box=box).select_related('box', 'box__project')
    
    if unread_only:
        queryset = queryset.filter(is_read=False)
    
    return list(queryset)


def get_project_comments(project: Project, unread_only: bool = False) -> List[Comment]:
    """
    Получение всех комментариев проекта.
    
    Args:
        project: Проект
        unread_only: Только непрочитанные
        
    Returns:
        Список комментариев
    """
    queryset = Comment.objects.filter(
        box__project=project
    ).select_related('box', 'box__project')
    
    if unread_only:
        queryset = queryset.filter(is_read=False)
    
    return list(queryset)


def get_unread_count(project: Project) -> int:
    """
    Получение количества непрочитанных комментариев проекта.
    
    Args:
        project: Проект
        
    Returns:
        Количество непрочитанных комментариев
    """
    return Comment.objects.filter(
        box__project=project,
        is_read=False
    ).count()
