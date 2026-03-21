import logging
from typing import Any

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.common.generation import (
    extract_result_url,
    finalize_generation_failure,
    finalize_generation_success,
    normalize_provider_response,
)
from apps.elements.models import Element
from apps.elements.tasks import notify_element_status

logger = logging.getLogger(__name__)


def _get_callback_field(payload: dict[str, Any], field: str, default: Any = "") -> Any:
    data = payload.get("data", payload)
    return data.get(field, payload.get(field, default))


@api_view(["POST"])
@permission_classes([AllowAny])
def generation_callback_view(request):
    """Kie.ai callback endpoint for generation completion."""
    token = request.query_params.get("token", "")
    if settings.KIE_CALLBACK_TOKEN and token != settings.KIE_CALLBACK_TOKEN:
        return Response({"error": "Invalid callback token"}, status=status.HTTP_403_FORBIDDEN)

    payload = request.data
    if not isinstance(payload, dict):
        return Response({"error": "Invalid JSON body"}, status=status.HTTP_400_BAD_REQUEST)

    task_id = _get_callback_field(payload, "taskId", "").strip()
    if not task_id:
        return Response({"error": "taskId is required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        element = Element.objects.select_related(
            "project", "scene", "ai_model"
        ).get(external_task_id=task_id)
    except Element.DoesNotExist:
        return Response({"error": "Element with taskId not found"}, status=status.HTTP_404_NOT_FOUND)

    if element.status in (Element.STATUS_COMPLETED, Element.STATUS_FAILED):
        return Response({"status": "ignored", "reason": "already_finalized"}, status=status.HTTP_200_OK)

    # Determine response mapping from model config
    response_mapping = getattr(element.ai_model, 'response_mapping', None) or {}
    normalized = normalize_provider_response(payload, response_mapping)
    state = normalized["state"]

    try:
        if state == "success":
            source_url = normalized.get("result_url")
            if not source_url:
                # Fallback: try standard extraction
                source_url = extract_result_url(payload)
            applied, file_url = finalize_generation_success(element.id, source_url)
            if applied:
                updated = Element.objects.get(id=element.id)
                notify_element_status(updated, "COMPLETED", file_url=file_url)
            return Response(
                {"status": "ok", "result": "completed", "applied": applied},
                status=status.HTTP_200_OK,
            )

        if state == "failed":
            fail_msg = normalized.get("error") or "Generation failed"
            applied = finalize_generation_failure(element.id, fail_msg)
            if applied:
                updated = Element.objects.get(id=element.id)
                notify_element_status(updated, "FAILED", error_message=fail_msg)
            return Response(
                {"status": "ok", "result": "failed", "applied": applied},
                status=status.HTTP_200_OK,
            )

        logger.info("Webhook state not final for taskId=%s, state=%s, format=%s", task_id, state, response_format)
        return Response(
            {"status": "ignored", "reason": "state_not_final", "state": state},
            status=status.HTTP_200_OK,
        )
    except Exception as exc:
        logger.exception("Ошибка обработки callback для taskId=%s: %s", task_id, exc)
        return Response({"error": "Failed to process callback"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
