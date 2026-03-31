from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notification_list(request):
    qs = Notification.objects.filter(user=request.user)

    type_filter = request.query_params.get('type')
    if type_filter:
        qs = qs.filter(type=type_filter)

    is_read = request.query_params.get('is_read')
    if is_read is not None:
        qs = qs.filter(is_read=is_read.lower() == 'true')

    page_size = 20
    offset = int(request.query_params.get('offset', 0))
    notifications = qs[offset:offset + page_size]
    has_more = qs.count() > offset + page_size

    return Response({
        'results': NotificationSerializer(notifications, many=True).data,
        'has_more': has_more,
        'next_offset': offset + page_size if has_more else None,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def unread_count(request):
    count = Notification.objects.filter(user=request.user, is_read=False).count()
    return Response({'count': count})


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def mark_read(request, notification_id):
    try:
        notification = Notification.objects.get(id=notification_id, user=request.user)
    except Notification.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    notification.is_read = True
    notification.save(update_fields=['is_read'])
    return Response(status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_all_read(request):
    Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
    return Response(status=status.HTTP_200_OK)
