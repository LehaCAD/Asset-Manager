from django.db.models import Count, Q
from django.utils.html import strip_tags
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from .models import Comment, SharedLink
from .permissions import IsProjectOwner
from .serializers import (
    CommentSerializer,
    CreateCommentAuthSerializer,
    CreateCommentPublicSerializer,
    PublicElementSerializer,
    PublicProjectSerializer,
    SharedLinkSerializer,
)


class SharedLinkViewSet(viewsets.ModelViewSet):
    serializer_class = SharedLinkSerializer
    permission_classes = [IsAuthenticated, IsProjectOwner]
    http_method_names = ['get', 'post', 'patch', 'delete']

    def get_queryset(self):
        qs = SharedLink.objects.filter(created_by=self.request.user)
        project_id = self.request.query_params.get('project')
        if project_id:
            qs = qs.filter(project_id=project_id)
        return qs

    def perform_create(self, serializer):
        project = serializer.validated_data.get('project')
        if project.user != self.request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You do not own this project.')
        serializer.save(created_by=self.request.user)


class PublicCommentThrottle(AnonRateThrottle):
    rate = '10/min'


@api_view(['GET'])
@permission_classes([AllowAny])
def public_share_view(request, token):
    """GET /api/sharing/public/{token}/ — reviewer loads shared content."""
    link = get_object_or_404(SharedLink, token=token)
    if link.is_expired():
        return Response(
            {'detail': 'Срок ссылки истёк.'},
            status=status.HTTP_410_GONE,
        )

    shared_elements = link.elements.select_related('scene').annotate(
        comment_count=Count('comments')
    ).all()
    scenes_map = {}
    ungrouped = []

    for el in shared_elements:
        el_data = {
            'id': el.id,
            'element_type': el.element_type,
            'file_url': el.file_url or '',
            'thumbnail_url': el.thumbnail_url or '',
            'comment_count': el.comment_count,  # from annotation
        }
        if el.scene_id:
            if el.scene_id not in scenes_map:
                scene = el.scene
                scenes_map[el.scene_id] = {
                    'id': scene.id,
                    'name': scene.name,
                    'order_index': scene.order_index,
                    'elements': [],
                    'comments': CommentSerializer(
                        scene.comments.filter(parent__isnull=True), many=True
                    ).data,
                }
            scenes_map[el.scene_id]['elements'].append(el_data)
        else:
            ungrouped.append(el_data)

    scenes = sorted(scenes_map.values(), key=lambda s: s['order_index'])

    return Response({
        'name': link.project.name,
        'scenes': scenes,
        'ungrouped_elements': ungrouped,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([PublicCommentThrottle])
def public_comment_view(request, token):
    """POST /api/sharing/public/{token}/comments/ — reviewer leaves a comment."""
    link = get_object_or_404(SharedLink, token=token)
    if link.is_expired():
        return Response(
            {'detail': 'Срок ссылки истёк.'},
            status=status.HTTP_410_GONE,
        )

    serializer = CreateCommentPublicSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    # Strip HTML from text
    clean_text = strip_tags(data['text'])

    # Validate target belongs to this shared link
    shared_element_ids = set(link.elements.values_list('id', flat=True))

    if data.get('element_id'):
        if data['element_id'] not in shared_element_ids:
            return Response(
                {'detail': 'Element not in this shared link.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        comment = Comment.objects.create(
            element_id=data['element_id'],
            author_name=data['author_name'],
            session_id=data['session_id'],
            text=clean_text,
            parent_id=data.get('parent_id'),
        )
    elif data.get('scene_id'):
        # Validate scene has at least one shared element
        from apps.elements.models import Element
        scene_has_shared = Element.objects.filter(
            scene_id=data['scene_id'], id__in=shared_element_ids
        ).exists()
        if not scene_has_shared:
            return Response(
                {'detail': 'Scene not in this shared link.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        comment = Comment.objects.create(
            scene_id=data['scene_id'],
            author_name=data['author_name'],
            session_id=data['session_id'],
            text=clean_text,
            parent_id=data.get('parent_id'),
        )

    # Send notifications (implemented in Task 7)
    try:
        from apps.notifications.services import notify_new_comment
        notify_new_comment(comment, link.project)
    except (ImportError, AttributeError):
        pass

    return Response(CommentSerializer(comment).data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def element_comments_view(request, element_id):
    """GET/POST /api/sharing/elements/{id}/comments/"""
    from apps.elements.models import Element
    element = get_object_or_404(Element, id=element_id, project__user=request.user)

    if request.method == 'GET':
        comments = element.comments.filter(parent__isnull=True).prefetch_related('replies')
        return Response(CommentSerializer(comments, many=True).data)

    serializer = CreateCommentAuthSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    comment = Comment.objects.create(
        element=element,
        author_name=request.user.username,
        author_user=request.user,
        session_id='',
        text=serializer.validated_data['text'],
        parent_id=serializer.validated_data.get('parent_id'),
    )
    return Response(CommentSerializer(comment).data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def scene_comments_view(request, scene_id):
    """GET/POST /api/sharing/scenes/{id}/comments/"""
    from apps.scenes.models import Scene
    scene = get_object_or_404(Scene, id=scene_id, project__user=request.user)

    if request.method == 'GET':
        comments = scene.comments.filter(parent__isnull=True).prefetch_related('replies')
        return Response(CommentSerializer(comments, many=True).data)

    serializer = CreateCommentAuthSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    comment = Comment.objects.create(
        scene=scene,
        author_name=request.user.username,
        author_user=request.user,
        session_id='',
        text=serializer.validated_data['text'],
        parent_id=serializer.validated_data.get('parent_id'),
    )
    return Response(CommentSerializer(comment).data, status=status.HTTP_201_CREATED)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def mark_comment_read(request, comment_id):
    """PATCH /api/sharing/comments/{id}/read/"""
    comment = get_object_or_404(Comment, id=comment_id)
    comment.is_read = True
    comment.save(update_fields=['is_read', 'updated_at'])
    # Sync notification
    try:
        from apps.notifications.models import Notification
        Notification.objects.filter(comment=comment, user=request.user).update(is_read=True)
    except (ImportError, AttributeError):
        pass
    return Response(status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_all_comments_read(request):
    """POST /api/sharing/comments/read-all/"""
    project_id = request.data.get('project_id')
    if not project_id:
        return Response({'detail': 'project_id required'}, status=400)

    Comment.objects.filter(
        Q(element__project_id=project_id) | Q(scene__project_id=project_id),
        is_read=False,
    ).update(is_read=True)

    try:
        from apps.notifications.models import Notification
        Notification.objects.filter(
            project_id=project_id, user=request.user, type='comment_new', is_read=False
        ).update(is_read=True)
    except (ImportError, AttributeError):
        pass

    return Response(status=status.HTTP_200_OK)
