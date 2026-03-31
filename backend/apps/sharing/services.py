from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from .models import SharedLink, Comment


def create_shared_link(project, created_by, element_ids, name='', expires_in_days=None):
    link = SharedLink.objects.create(
        project=project,
        created_by=created_by,
        name=name,
        expires_at=timezone.now() + timedelta(days=expires_in_days) if expires_in_days else None,
    )
    link.elements.set(element_ids)
    return link


def get_active_links(project):
    return SharedLink.objects.filter(project=project).order_by('-created_at')


def get_unread_comment_count(project):
    return Comment.objects.filter(
        Q(element__project=project) | Q(scene__project=project),
        is_read=False,
    ).exclude(author_user=project.user).count()
