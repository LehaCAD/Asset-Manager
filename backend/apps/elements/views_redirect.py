"""Public redirect endpoint that hides raw S3 URLs behind /elements/<id>/.

  GET  /elements/<id>/           -> 302 file_url       (original)
  GET  /elements/<id>/file/      -> 302 file_url
  GET  /elements/<id>/thumb/     -> 302 thumbnail_url  (256px)
  GET  /elements/<id>/preview/   -> 302 preview_url    (800px)

Responses:
  302  happy path
  404  element does not exist, or variant is unknown
  410  element exists but the backing S3 URL is empty
  405  method other than GET/HEAD
"""
from __future__ import annotations

from django.http import (
    HttpResponse,
    HttpResponseGone,
    HttpResponseNotAllowed,
    HttpResponseNotFound,
    HttpResponseRedirect,
)
from django.views.decorators.http import require_http_methods

from .models import Element
from .url_helpers import _source_url


_VALID_VARIANTS = {'file', 'thumb', 'preview'}


@require_http_methods(['GET', 'HEAD'])
def element_redirect(request, element_id: int, variant: str = 'file') -> HttpResponse:
    if variant not in _VALID_VARIANTS:
        return HttpResponseNotFound()

    try:
        element = Element.objects.only(
            'id', 'file_url', 'thumbnail_url', 'preview_url'
        ).get(pk=element_id)
    except Element.DoesNotExist:
        return HttpResponseNotFound()

    target = _source_url(element, variant)
    if not target:
        return HttpResponseGone()

    return HttpResponseRedirect(target)
