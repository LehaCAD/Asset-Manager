"""Helpers for building public element URLs that proxy S3 behind a branded route.

Serializers call these to emit `/elements/<id>/...` URLs instead of raw S3 links.
The actual 302 redirect happens in `ElementRedirectView`.
"""
from __future__ import annotations

from typing import Literal, Optional


Variant = Literal['file', 'thumb', 'preview']


def _source_url(element, variant: Variant) -> str:
    """Return the raw S3 URL the given variant maps to."""
    if variant == 'file':
        return element.file_url or ''
    if variant == 'thumb':
        return element.thumbnail_url or ''
    if variant == 'preview':
        return element.preview_url or ''
    return ''


def _path_for(element_id: int, variant: Variant) -> str:
    if variant == 'file':
        return f'/elements/{element_id}/'
    return f'/elements/{element_id}/{variant}/'


def build_element_url(element, variant: Variant, request: Optional[object]) -> str:
    """Build the public redirect URL for one element variant.

    Returns '' when the backing S3 URL is empty — the frontend treats ''
    as "no image", so downstream code doesn't need to branch.
    """
    if not _source_url(element, variant):
        return ''
    path = _path_for(element.id, variant)
    if request is not None:
        return request.build_absolute_uri(path)
    return path


def build_best_preview_url(element, request: Optional[object]) -> str:
    """Pick the highest-quality preview available (preview > thumb > file).

    Mirrors the existing cascade used across SceneSerializer/ProjectSerializer
    so preview grids keep the same fallback behaviour — just over the
    branded URL rather than raw S3.
    """
    for variant in ('preview', 'thumb', 'file'):
        if _source_url(element, variant):
            return build_element_url(element, variant, request)
    return ''
