import logging
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.elements.models import Element
from apps.elements.serializers import ElementSerializer
from apps.elements.tasks import notify_element_status
from apps.common.presigned import head_s3_object, get_public_url

logger = logging.getLogger(__name__)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_complete(request, element_id):
    """Two-phase upload completion: 'thumbnail' then 'final'."""
    try:
        element = Element.objects.select_related('project').get(
            id=element_id,
            project__user=request.user,
            status=Element.STATUS_UPLOADING,
        )
    except Element.DoesNotExist:
        return Response({'error': 'Element not found or not in UPLOADING status'}, status=status.HTTP_404_NOT_FOUND)

    phase = request.data.get('phase')
    keys = element.upload_keys or {}

    if phase == 'thumbnail':
        element.thumbnail_url = get_public_url(keys.get('small', ''))
        element.save(update_fields=['thumbnail_url', 'updated_at'])
        notify_element_status(element, 'UPLOADING', preview_url='')
        return Response(ElementSerializer(element).data)

    elif phase == 'final':
        # HEAD check on original
        original_key = keys.get('original', '')
        head = head_s3_object(original_key)
        if not head:
            return Response(
                {'error': 'Original file not found in S3'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        element.file_url = get_public_url(original_key)
        element.preview_url = get_public_url(keys.get('medium', ''))
        element.file_size = head['size']
        element.status = Element.STATUS_COMPLETED
        element.save(update_fields=[
            'file_url', 'preview_url', 'file_size', 'status', 'updated_at',
        ])
        notify_element_status(
            element, 'COMPLETED',
            file_url=element.file_url,
            preview_url=element.preview_url,
        )
        return Response(ElementSerializer(element).data)

    return Response({'error': 'Invalid phase'}, status=status.HTTP_400_BAD_REQUEST)
