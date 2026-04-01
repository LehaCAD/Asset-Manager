import logging

from django.db.models import Count, Q
from django.utils.html import strip_tags
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

from .models import Comment, ElementReaction, SharedLink
from .permissions import IsProjectOwner
from .serializers import (
    CommentSerializer,
    CreateCommentAuthSerializer,
    CreateCommentPublicSerializer,
    PublicElementSerializer,
    PublicProjectSerializer,
    SharedLinkSerializer,
)

logger = logging.getLogger(__name__)


class AuthCommentThrottle(UserRateThrottle):
    rate = '30/min'


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

    shared_elements = link.elements.select_related('scene').prefetch_related('reactions').annotate(
        comment_count=Count('comments'),
        likes=Count('reactions', filter=Q(reactions__value='like')),
        dislikes=Count('reactions', filter=Q(reactions__value='dislike')),
    ).all()

    # Prefetch all element comments in one query to avoid N+1
    element_ids = list(shared_elements.values_list('id', flat=True))
    comments_by_element = {}
    all_element_comments = Comment.objects.filter(
        element_id__in=element_ids, parent__isnull=True
    ).prefetch_related('replies').order_by('created_at')
    for c in all_element_comments:
        comments_by_element.setdefault(c.element_id, []).append(c)

    # Prefetch all scene comments in one query
    scene_ids = set(el.scene_id for el in shared_elements if el.scene_id)
    comments_by_scene = {}
    if scene_ids:
        scene_comments = Comment.objects.filter(
            scene_id__in=scene_ids, parent__isnull=True
        ).prefetch_related('replies').order_by('created_at')
        for c in scene_comments:
            comments_by_scene.setdefault(c.scene_id, []).append(c)

    scenes_map = {}
    ungrouped = []

    for el in shared_elements:
        el_data = {
            'id': el.id,
            'element_type': el.element_type,
            'file_url': el.file_url or '',
            'thumbnail_url': el.thumbnail_url or '',
            'comment_count': el.comment_count,  # from annotation
            'likes': el.likes,
            'dislikes': el.dislikes,
            'reactions': [
                {'session_id': r.session_id, 'author_name': r.author_name, 'value': r.value}
                for r in el.reactions.all()
            ],
            'comments': CommentSerializer(comments_by_element.get(el.id, []), many=True).data,
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
                        comments_by_scene.get(scene.id, []), many=True
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
        'display_preferences': link.display_preferences,
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
        comment = Comment(
            element_id=data['element_id'],
            author_name=data['author_name'],
            session_id=data['session_id'],
            text=clean_text,
            parent_id=data.get('parent_id'),
        )
        comment.full_clean()
        comment.save()
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
        comment = Comment(
            scene_id=data['scene_id'],
            author_name=data['author_name'],
            session_id=data['session_id'],
            text=clean_text,
            parent_id=data.get('parent_id'),
        )
        comment.full_clean()
        comment.save()

    # Send notifications
    try:
        from apps.notifications.services import notify_new_comment
        notify_new_comment(comment, link.project)
    except Exception as e:
        logger.warning(f'Failed to send comment notification: {e}')

    return Response(CommentSerializer(comment).data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([PublicCommentThrottle])
def public_reaction_view(request, token):
    """POST /api/sharing/public/{token}/reactions/ — reviewer reacts to element."""
    link = get_object_or_404(SharedLink, token=token)
    if link.is_expired():
        return Response({'detail': 'Срок ссылки истёк.'}, status=status.HTTP_410_GONE)

    element_id = request.data.get('element_id')
    session_id = request.data.get('session_id')
    value = request.data.get('value')  # 'like', 'dislike', or null to remove
    author_name = request.data.get('author_name', '')

    if not element_id or not session_id:
        return Response({'detail': 'element_id and session_id required'}, status=400)

    shared_element_ids = set(link.elements.values_list('id', flat=True))
    if element_id not in shared_element_ids:
        return Response({'detail': 'Element not in this shared link.'}, status=400)

    if not value:
        # Remove reaction
        ElementReaction.objects.filter(element_id=element_id, session_id=session_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if value not in ('like', 'dislike'):
        return Response({'detail': 'value must be "like" or "dislike"'}, status=400)

    reaction, created = ElementReaction.objects.update_or_create(
        element_id=element_id,
        session_id=session_id,
        defaults={'value': value, 'author_name': author_name},
    )

    # Notify only on FIRST reaction from this session (not toggles/changes)
    if created:
        try:
            from apps.notifications.services import create_notification
            from apps.notifications.models import Notification
            from apps.elements.models import Element
            el = Element.objects.select_related('project__user').get(id=element_id)
            emoji = '\U0001f44d' if value == 'like' else '\U0001f44e'
            display_name = author_name or 'Гость'
            create_notification(
                user=el.project.user,
                type=Notification.Type.COMMENT_NEW,
                project=el.project,
                title=f'{display_name} {emoji}',
                message='Реакция на элемент',
                element=el,
            )
        except Exception as e:
            logger.warning(f'Failed to send reaction notification: {e}')

    return Response({'element_id': element_id, 'value': value}, status=status.HTTP_200_OK)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([AuthCommentThrottle])
def element_comments_view(request, element_id):
    """GET/POST /api/sharing/elements/{id}/comments/"""
    from apps.elements.models import Element
    element = get_object_or_404(Element, id=element_id, project__user=request.user)

    if request.method == 'GET':
        comments = element.comments.filter(parent__isnull=True).prefetch_related('replies')
        return Response(CommentSerializer(comments, many=True).data)

    serializer = CreateCommentAuthSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    text = strip_tags(serializer.validated_data['text'])
    comment = Comment(
        element=element,
        author_name=request.user.username,
        author_user=request.user,
        session_id='',
        text=text,
        parent_id=serializer.validated_data.get('parent_id'),
    )
    comment.full_clean()
    comment.save()
    return Response(CommentSerializer(comment).data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([AuthCommentThrottle])
def scene_comments_view(request, scene_id):
    """GET/POST /api/sharing/scenes/{id}/comments/"""
    from apps.scenes.models import Scene
    scene = get_object_or_404(Scene, id=scene_id, project__user=request.user)

    if request.method == 'GET':
        comments = scene.comments.filter(parent__isnull=True).prefetch_related('replies')
        return Response(CommentSerializer(comments, many=True).data)

    serializer = CreateCommentAuthSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    text = strip_tags(serializer.validated_data['text'])
    comment = Comment(
        scene=scene,
        author_name=request.user.username,
        author_user=request.user,
        session_id='',
        text=text,
        parent_id=serializer.validated_data.get('parent_id'),
    )
    comment.full_clean()
    comment.save()
    return Response(CommentSerializer(comment).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def element_reactions_view(request, element_id):
    """GET /api/sharing/elements/{id}/reactions/"""
    from apps.elements.models import Element
    element = get_object_or_404(Element, id=element_id, project__user=request.user)
    reactions = ElementReaction.objects.filter(element=element)
    data = [{'session_id': r.session_id, 'author_name': r.author_name, 'value': r.value} for r in reactions]
    return Response(data)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def mark_comment_read(request, comment_id):
    """PATCH /api/sharing/comments/{id}/read/"""
    comment = get_object_or_404(
        Comment,
        Q(element__project__user=request.user) | Q(scene__project__user=request.user),
        id=comment_id,
    )
    comment.is_read = True
    comment.save(update_fields=['is_read', 'updated_at'])
    # Sync notification
    try:
        from apps.notifications.models import Notification
        Notification.objects.filter(comment=comment, user=request.user).update(is_read=True)
    except Exception as e:
        logger.warning(f'Failed to sync notification read status: {e}')
    return Response(status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_all_comments_read(request):
    """POST /api/sharing/comments/read-all/"""
    project_id = request.data.get('project_id')
    if not project_id:
        return Response({'detail': 'project_id required'}, status=400)

    from apps.projects.models import Project
    project = get_object_or_404(Project, id=project_id, user=request.user)

    Comment.objects.filter(
        Q(element__project=project) | Q(scene__project=project),
        is_read=False,
    ).update(is_read=True)

    try:
        from apps.notifications.models import Notification
        Notification.objects.filter(
            project=project, user=request.user, type='comment_new', is_read=False
        ).update(is_read=True)
    except Exception as e:
        logger.warning(f'Failed to sync notification read-all status: {e}')

    return Response(status=status.HTTP_200_OK)
