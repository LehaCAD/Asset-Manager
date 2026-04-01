from datetime import timedelta

from django.utils import timezone

from .models import SharedLink


def create_shared_link(project, created_by, element_ids, name='', expires_in_days=None):
    link = SharedLink.objects.create(
        project=project,
        created_by=created_by,
        name=name,
        expires_at=timezone.now() + timedelta(days=expires_in_days) if expires_in_days else None,
    )
    link.elements.set(element_ids)
    return link
