import logging

from django.core.exceptions import ValidationError
from django.db.models import Count, Q
from django.utils.html import strip_tags
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

from apps.elements.url_helpers import build_element_url
from .models import Comment, ElementReaction, ElementReview, SharedLink
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


def _broadcast_to_share_groups(element_id, event_type, data):
    """Broadcast event to all share_{token} groups that include this element."""
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        channel_layer = get_channel_layer()
        if not channel_layer:
            return

        tokens = list(SharedLink.objects.filter(
            elements__id=element_id
        ).values_list('token', flat=True))

        for token in tokens:
            async_to_sync(channel_layer.group_send)(
                f'share_{token}',
                {'type': event_type, 'data': data}
            )
    except Exception as e:
        logger.warning(f'Failed to broadcast {event_type}: {e}')


class AuthCommentThrottle(UserRateThrottle):
    rate = '120/min'


class SharedLinkViewSet(viewsets.ModelViewSet):
    serializer_class = SharedLinkSerializer
    permission_classes = [IsAuthenticated, IsProjectOwner]
    http_method_names = ['get', 'post', 'patch', 'delete']

    def get_permissions(self):
        from apps.subscriptions.permissions import feature_required
        if self.action == 'create':
            return [IsAuthenticated(), IsProjectOwner(), feature_required('sharing')()]
        return [IsAuthenticated(), IsProjectOwner()]

    def get_queryset(self):
        qs = SharedLink.objects.filter(created_by=self.request.user).select_related('project')
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
    rate = '60/min'


class PublicReadThrottle(AnonRateThrottle):
    rate = '120/min'


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([PublicReadThrottle])
def public_share_view(request, token):
    """GET /api/sharing/public/{token}/ — reviewer loads shared content."""
    link = get_object_or_404(SharedLink, token=token)
    if link.is_expired():
        return Response(
            {'detail': 'Срок ссылки истёк.'},
            status=status.HTTP_410_GONE,
        )

    shared_elements = link.elements.select_related('scene').prefetch_related('reactions', 'reviews').all()

    # Prefetch all element comments in one query to avoid N+1
    element_ids = list(shared_elements.values_list('id', flat=True))
    comments_by_element = {}
    all_element_comments = Comment.objects.filter(
        element_id__in=element_ids, parent__isnull=True, is_system=False
    ).prefetch_related('replies').order_by('created_at')
    for c in all_element_comments:
        comments_by_element.setdefault(c.element_id, []).append(c)

    # Prefetch all scene comments in one query
    scene_ids = set(el.scene_id for el in shared_elements if el.scene_id)
    comments_by_scene = {}
    if scene_ids:
        scene_comments = Comment.objects.filter(
            scene_id__in=scene_ids, parent__isnull=True, is_system=False
        ).prefetch_related('replies').order_by('created_at')
        for c in scene_comments:
            comments_by_scene.setdefault(c.scene_id, []).append(c)

    scenes_map = {}
    ungrouped = []

    # Pre-compute comment counts (including replies) and reaction counts
    element_comment_counts = {}
    for eid in element_ids:
        top_level = comments_by_element.get(eid, [])
        total = sum(1 + len(c.replies.all()) for c in top_level) if top_level else 0
        element_comment_counts[eid] = total

    element_reaction_counts = {}
    for el in shared_elements:
        reactions = list(el.reactions.all())
        element_reaction_counts[el.id] = {
            'likes': sum(1 for r in reactions if r.value == 'like'),
            'dislikes': sum(1 for r in reactions if r.value == 'dislike'),
        }

    for el in shared_elements:
        rc = element_reaction_counts.get(el.id, {'likes': 0, 'dislikes': 0})
        el_data = {
            'id': el.id,
            'element_type': el.element_type,
            'file_url': build_element_url(el, 'file', request),
            'thumbnail_url': build_element_url(el, 'thumb', request),
            'preview_url': build_element_url(el, 'preview', request),
            'comment_count': element_comment_counts.get(el.id, 0),
            'source_type': el.source_type,
            'original_filename': getattr(el, 'original_filename', ''),
            'likes': rc['likes'],
            'dislikes': rc['dislikes'],
            'reactions': [
                {'session_id': r.session_id, 'author_name': r.author_name, 'value': r.value}
                for r in el.reactions.all()
            ],
            'reviews': [
                {'session_id': rv.session_id, 'author_name': rv.author_name, 'action': rv.action}
                for rv in el.reviews.all()
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

    # Load general comments for the shared link
    general_comments = Comment.objects.filter(
        shared_link=link, parent__isnull=True, is_system=False
    ).prefetch_related('replies').order_by('created_at')

    total_elements = len(ungrouped) + sum(len(s['elements']) for s in scenes)
    return Response({
        'name': link.project.name,
        'link_name': link.name or '',
        'created_at': link.created_at.isoformat(),
        'expires_at': link.expires_at.isoformat() if link.expires_at else None,
        'total_elements': total_elements,
        'scenes': scenes,
        'ungrouped_elements': ungrouped,
        'display_preferences': link.display_preferences,
        'general_comments': CommentSerializer(general_comments, many=True).data,
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
    data['author_name'] = strip_tags(data.get('author_name', '')).strip()[:100]

    # Strip HTML from text
    clean_text = strip_tags(data['text'])

    # Validate target belongs to this shared link
    shared_element_ids = set(link.elements.values_list('id', flat=True))

    # Validate parent_id if provided
    parent_id = data.get('parent_id')
    if parent_id is not None:
        try:
            parent_comment = Comment.objects.get(id=parent_id)
        except Comment.DoesNotExist:
            return Response(
                {'detail': 'Parent comment not found.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if data.get('element_id') and parent_comment.element_id != data['element_id']:
            return Response(
                {'detail': 'Parent comment belongs to a different element.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if data.get('scene_id') and parent_comment.scene_id != data['scene_id']:
            return Response(
                {'detail': 'Parent comment belongs to a different scene.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
            is_system=False,
        )
        try:
            comment.full_clean()
        except ValidationError as e:
            return Response(
                {'detail': e.message_dict if hasattr(e, 'message_dict') else str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        comment.save()

        # Broadcast to share group
        _broadcast_to_share_groups(
            comment.element_id,
            'new_comment',
            {
                'type': 'new_comment',
                'comment_id': comment.id,
                'element_id': comment.element_id,
                'scene_id': comment.scene_id,
                'parent_id': comment.parent_id,
                'author_name': comment.author_name,
                'text': comment.text[:200],
                'created_at': comment.created_at.isoformat(),
                'session_id': comment.session_id,
            }
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
        comment = Comment(
            scene_id=data['scene_id'],
            author_name=data['author_name'],
            session_id=data['session_id'],
            text=clean_text,
            parent_id=data.get('parent_id'),
            is_system=False,
        )
        try:
            comment.full_clean()
        except ValidationError as e:
            return Response(
                {'detail': e.message_dict if hasattr(e, 'message_dict') else str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        comment.save()

        # Broadcast scene comment to share groups
        try:
            from apps.elements.models import Element
            scene_element_ids = list(Element.objects.filter(
                scene_id=data['scene_id']
            ).values_list('id', flat=True)[:1])
            if scene_element_ids:
                _broadcast_to_share_groups(
                    scene_element_ids[0],
                    'new_comment',
                    {
                        'type': 'new_comment',
                        'comment_id': comment.id,
                        'element_id': None,
                        'scene_id': comment.scene_id,
                        'parent_id': comment.parent_id,
                        'author_name': comment.author_name,
                        'text': comment.text[:200],
                        'created_at': comment.created_at.isoformat(),
                        'session_id': comment.session_id,
                    }
                )
        except Exception as e:
            logger.warning(f'Failed to broadcast scene comment: {e}')

    elif not data.get('element_id') and not data.get('scene_id'):
        # General comment to the shared link itself
        comment = Comment(
            shared_link=link,
            author_name=data['author_name'],
            session_id=data['session_id'],
            text=clean_text,
            parent_id=data.get('parent_id'),
            is_system=False,
        )
        try:
            comment.full_clean()
        except ValidationError as e:
            return Response(
                {'detail': e.message_dict if hasattr(e, 'message_dict') else str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        comment.save()

        # Broadcast to share group
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            channel_layer = get_channel_layer()
            if channel_layer:
                async_to_sync(channel_layer.group_send)(
                    f'share_{link.token}',
                    {'type': 'new_comment', 'data': {
                        'type': 'new_comment',
                        'comment_id': comment.id,
                        'element_id': None,
                        'scene_id': None,
                        'shared_link_id': link.id,
                        'parent_id': comment.parent_id,
                        'author_name': comment.author_name,
                        'text': comment.text[:200],
                        'created_at': comment.created_at.isoformat(),
                        'session_id': comment.session_id,
                    }}
                )
        except Exception as e:
            logger.warning(f'Failed to broadcast general comment: {e}')

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
def public_review_action(request, token):
    """POST /api/sharing/public/{token}/review/ — reviewer submits review decision."""
    link = get_object_or_404(SharedLink, token=token)
    if link.is_expired():
        return Response({'detail': 'Срок ссылки истёк.'}, status=status.HTTP_410_GONE)

    element_id = request.data.get('element_id')
    try:
        element_id = int(element_id)
    except (TypeError, ValueError):
        return Response({'detail': 'element_id must be an integer.'}, status=400)
    action = request.data.get('action')
    session_id = request.data.get('session_id', '')
    author_name = strip_tags(request.data.get('author_name', '')).strip()[:100]

    if not element_id or not action:
        return Response({'error': 'element_id and action required'}, status=400)

    if action not in ('approved', 'changes_requested', 'rejected'):
        return Response({'error': 'Invalid action'}, status=400)

    shared_element_ids = set(link.elements.values_list('id', flat=True))
    if element_id not in shared_element_ids:
        return Response({'detail': 'Element not in this shared link.'}, status=400)

    # Check if same action already set — toggle off
    existing = ElementReview.objects.filter(
        element_id=element_id, session_id=session_id
    ).first()

    if existing and existing.action == action:
        existing.delete()

        _broadcast_to_share_groups(element_id, 'review_updated', {
            'type': 'review_updated',
            'element_id': element_id,
            'session_id': session_id,
            'author_name': author_name,
            'action': None,
        })

        try:
            from apps.notifications.services import notify_review_updated
            from apps.elements.models import Element
            el = Element.objects.get(id=element_id)
            notify_review_updated(el, None, author_name)
        except Exception as e:
            logger.warning(f'Failed to broadcast review to project: {e}')

        return Response({'element_id': element_id, 'action': None})

    # Clean up guest session duplicate if user is now authenticated
    if session_id.startswith('user_'):
        ElementReview.objects.filter(
            element_id=element_id, author_name=author_name,
        ).exclude(session_id=session_id).delete()

    # update_or_create — one review per reviewer per element
    review, _ = ElementReview.objects.update_or_create(
        element_id=element_id,
        session_id=session_id,
        defaults={'action': action, 'author_name': author_name},
    )

    # Notify project owner about review decision
    try:
        from apps.notifications.services import create_notification
        from apps.notifications.models import Notification
        from apps.elements.models import Element
        el = Element.objects.select_related('project__user').get(id=element_id)
        action_labels = {
            'approved': 'Согласовано ✅',
            'changes_requested': 'На доработку 🔄',
            'rejected': 'Отклонено ❌',
        }
        display_name = author_name or 'Гость'
        create_notification(
            user=el.project.user,
            type=Notification.Type.REVIEW_NEW,
            project=el.project,
            title=f'{display_name}: {action_labels.get(action, action)}',
            message='Решение по элементу',
            element=el,
        )
    except Exception as e:
        logger.warning(f'Failed to send review notification: {e}')

    _broadcast_to_share_groups(element_id, 'review_updated', {
        'type': 'review_updated',
        'element_id': element_id,
        'session_id': session_id,
        'author_name': review.author_name,
        'action': review.action,
    })

    try:
        from apps.notifications.services import notify_review_updated
        notify_review_updated(el, review.action, review.author_name)
    except Exception as e:
        logger.warning(f'Failed to broadcast review to project: {e}')

    return Response({
        'element_id': element_id,
        'action': review.action,
        'author_name': review.author_name,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([PublicCommentThrottle])
def public_reaction_view(request, token):
    """POST /api/sharing/public/{token}/reactions/ — reviewer reacts to element."""
    link = get_object_or_404(SharedLink, token=token)
    if link.is_expired():
        return Response({'detail': 'Срок ссылки истёк.'}, status=status.HTTP_410_GONE)

    element_id = request.data.get('element_id')
    try:
        element_id = int(element_id)
    except (TypeError, ValueError):
        return Response({'detail': 'element_id must be an integer.'}, status=400)
    session_id = request.data.get('session_id')
    value = request.data.get('value')  # 'like', 'dislike', or null to remove
    author_name = strip_tags(request.data.get('author_name', '')).strip()[:100]

    if not element_id or not session_id:
        return Response({'detail': 'element_id and session_id required'}, status=400)

    shared_element_ids = set(link.elements.values_list('id', flat=True))
    if element_id not in shared_element_ids:
        return Response({'detail': 'Element not in this shared link.'}, status=400)

    if not value:
        # Remove reaction
        ElementReaction.objects.filter(element_id=element_id, session_id=session_id).delete()
        # Return actual counts after removal
        likes = ElementReaction.objects.filter(element_id=element_id, value='like').count()
        dislikes = ElementReaction.objects.filter(element_id=element_id, value='dislike').count()

        # Broadcast to share group
        _broadcast_to_share_groups(
            element_id,
            'reaction_updated',
            {
                'type': 'reaction_updated',
                'element_id': element_id,
                'likes': likes,
                'dislikes': dislikes,
                'session_id': session_id,
                'value': None,
            }
        )

        # Broadcast to project group
        try:
            from apps.notifications.services import notify_reaction_updated
            from apps.elements.models import Element
            el = Element.objects.get(id=element_id)
            notify_reaction_updated(el, likes, dislikes)
        except Exception as e:
            logger.warning(f'Failed to broadcast reaction to project: {e}')

        return Response({'element_id': element_id, 'value': None, 'likes': likes, 'dislikes': dislikes})

    if value not in ('like', 'dislike'):
        return Response({'detail': 'value must be "like" or "dislike"'}, status=400)

    # Clean up guest session duplicate if user is now authenticated
    if session_id.startswith('user_'):
        ElementReaction.objects.filter(
            element_id=element_id, author_name=author_name,
        ).exclude(session_id=session_id).delete()

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
                type=Notification.Type.REACTION_NEW,
                project=el.project,
                title=f'{display_name} {emoji}',
                message='Реакция на элемент',
                element=el,
            )
        except Exception as e:
            logger.warning(f'Failed to send reaction notification: {e}')

    # Return actual counts — the source of truth, no optimistic drift
    likes = ElementReaction.objects.filter(element_id=element_id, value='like').count()
    dislikes = ElementReaction.objects.filter(element_id=element_id, value='dislike').count()

    # Broadcast to share group
    _broadcast_to_share_groups(
        element_id,
        'reaction_updated',
        {
            'type': 'reaction_updated',
            'element_id': element_id,
            'likes': likes,
            'dislikes': dislikes,
            'session_id': session_id,
            'value': value,
        }
    )

    # Broadcast to project group
    try:
        from apps.notifications.services import notify_reaction_updated
        from apps.elements.models import Element
        el = Element.objects.get(id=element_id)
        notify_reaction_updated(el, likes, dislikes)
    except Exception as e:
        logger.warning(f'Failed to broadcast reaction to project: {e}')

    return Response({'element_id': element_id, 'value': value, 'likes': likes, 'dislikes': dislikes})


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([AuthCommentThrottle])
def element_comments_view(request, element_id):
    """GET/POST /api/sharing/elements/{id}/comments/"""
    from apps.elements.models import Element
    element = get_object_or_404(Element, id=element_id, project__user=request.user)

    if request.method == 'GET':
        comments = element.comments.filter(parent__isnull=True, is_system=False).prefetch_related('replies')
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
        is_system=False,
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
        comments = scene.comments.filter(parent__isnull=True, is_system=False).prefetch_related('replies')
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
        is_system=False,
    )
    comment.full_clean()
    comment.save()
    return Response(CommentSerializer(comment).data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([AuthCommentThrottle])
def link_comments_view(request, link_id):
    """GET/POST /api/sharing/links/{id}/comments/ — general comments on shared link."""
    link = get_object_or_404(SharedLink, id=link_id, created_by=request.user)

    if request.method == 'GET':
        comments = Comment.objects.filter(
            shared_link=link, parent__isnull=True, is_system=False
        ).prefetch_related('replies').order_by('created_at')
        return Response(CommentSerializer(comments, many=True).data)

    serializer = CreateCommentAuthSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    text = strip_tags(serializer.validated_data['text'])
    comment = Comment(
        shared_link=link,
        author_name=request.user.username,
        author_user=request.user,
        session_id='',
        text=text,
        parent_id=serializer.validated_data.get('parent_id'),
        is_system=False,
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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def element_reviews_view(request, element_id):
    """GET /api/sharing/elements/{id}/reviews/"""
    from apps.elements.models import Element
    element = get_object_or_404(Element, id=element_id, project__user=request.user)
    reviews = ElementReview.objects.filter(element=element)
    data = [{'session_id': r.session_id, 'author_name': r.author_name, 'action': r.action} for r in reviews]
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def project_element_ids(request, project_id):
    """GET /api/sharing/project-elements/{project_id}/ — all elements in project with metadata for filtering."""
    from apps.projects.models import Project
    from apps.elements.models import Element
    project = get_object_or_404(Project, id=project_id, user=request.user)
    elements = list(
        Element.objects.filter(project=project)
        .exclude(status='FAILED')
        .values('id', 'element_type', 'is_favorite', 'source_type')
    )
    return Response({'elements': elements})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def group_element_ids(request, scene_id):
    """GET /api/sharing/group-elements/{scene_id}/ — element IDs in scene + children."""
    from apps.scenes.models import Scene
    from apps.elements.models import Element
    scene = get_object_or_404(Scene, id=scene_id, project__user=request.user)

    # Single query: all scenes in this project, then BFS in Python
    all_scenes = list(
        Scene.objects.filter(project=scene.project).values_list('id', 'parent_id')
    )
    children_map = {}
    for sid, pid in all_scenes:
        children_map.setdefault(pid, []).append(sid)

    # BFS from target scene
    scene_ids = []
    queue = [scene.id]
    while queue:
        current = queue.pop(0)
        scene_ids.append(current)
        queue.extend(children_map.get(current, []))

    elements = list(
        Element.objects.filter(scene_id__in=scene_ids)
        .exclude(status='FAILED')
        .values('id', 'element_type', 'is_favorite', 'source_type')
    )
    return Response({'elements': elements})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def all_feedback_view(request):
    """GET /api/sharing/all-feedback/ — all feedback across all user's projects."""
    links = SharedLink.objects.filter(project__user=request.user).select_related('project').order_by('-created_at')
    return _build_feedback_response(request, links)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def project_feedback_view(request, project_id):
    """GET /api/sharing/project-feedback/{project_id}/ — all feedback for project grouped by links."""
    from apps.projects.models import Project
    project = get_object_or_404(Project, id=project_id, user=request.user)

    links = SharedLink.objects.filter(project=project).order_by('-created_at')
    return _build_feedback_response(request, links)


def _build_feedback_response(request, links):
    """Shared logic for building feedback response from a queryset of links."""
    from apps.notifications.models import Notification
    from collections import defaultdict

    links_list = list(links)
    if not links_list:
        return Response({'links': []})

    # Collect all element IDs across all links (bulk)
    link_element_ids = {}
    all_element_ids = set()
    for link in links_list:
        eids = set(link.elements.values_list('id', flat=True))
        link_element_ids[link.id] = eids
        all_element_ids.update(eids)

    # Bulk fetch elements with prefetch
    from apps.elements.models import Element
    elements_qs = Element.objects.filter(id__in=all_element_ids).select_related('scene').prefetch_related('reactions', 'reviews')
    elements_map = {el.id: el for el in elements_qs}

    # Bulk fetch all comments for all elements
    all_comments = Comment.objects.filter(
        element_id__in=all_element_ids, parent__isnull=True, is_system=False
    ).prefetch_related('replies').order_by('created_at')
    comments_by_element = defaultdict(list)
    for c in all_comments:
        comments_by_element[c.element_id].append(c)

    # Bulk fetch general comments for all links
    link_ids = [l.id for l in links_list]
    all_general_comments = Comment.objects.filter(
        shared_link_id__in=link_ids, parent__isnull=True, is_system=False
    ).prefetch_related('replies').order_by('created_at')
    general_comments_by_link = defaultdict(list)
    for c in all_general_comments:
        general_comments_by_link[c.shared_link_id].append(c)

    # Bulk fetch all reviews for stats
    all_reviews = ElementReview.objects.filter(element_id__in=all_element_ids)
    reviews_by_element = defaultdict(list)
    for r in all_reviews:
        reviews_by_element[r.element_id].append(r)

    # Bulk unread counts: comments
    unread_comments_qs = Comment.objects.filter(
        Q(element_id__in=all_element_ids) | Q(shared_link_id__in=link_ids),
        is_read=False, is_system=False,
    ).exclude(author_user=request.user).values_list('element_id', 'shared_link_id')
    unread_by_element = defaultdict(int)
    unread_by_link_direct = defaultdict(int)
    for el_id, sl_id in unread_comments_qs:
        if el_id:
            unread_by_element[el_id] += 1
        if sl_id:
            unread_by_link_direct[sl_id] += 1

    # Bulk unread notifications (reaction_new, review_new)
    unread_notif_qs = Notification.objects.filter(
        user=request.user, is_read=False,
        type__in=['reaction_new', 'review_new'],
        element_id__in=all_element_ids,
    ).values_list('element_id', flat=True)
    unread_notif_by_element = defaultdict(int)
    for el_id in unread_notif_qs:
        unread_notif_by_element[el_id] += 1

    # Build response
    result = []
    for link in links_list:
        eids = link_element_ids[link.id]

        # Elements with feedback
        elements_with_feedback = []
        for eid in eids:
            el = elements_map.get(eid)
            if not el:
                continue

            el_comments = comments_by_element.get(eid, [])
            el_reviews = reviews_by_element.get(eid, [])
            reactions = list(el.reactions.all())
            likes = sum(1 for r in reactions if r.value == 'like')
            dislikes = sum(1 for r in reactions if r.value == 'dislike')

            has_feedback = len(el_comments) > 0 or likes > 0 or dislikes > 0 or len(el_reviews) > 0
            if not has_feedback:
                continue

            # Review summary (worst-wins)
            review_summary = None
            if el_reviews:
                priority = {'rejected': 0, 'changes_requested': 1, 'approved': 2}
                worst = min(el_reviews, key=lambda r: priority.get(r.action, 99))
                review_summary = {'action': worst.action, 'author_name': worst.author_name}

            elements_with_feedback.append({
                'id': el.id,
                'scene_id': el.scene_id,
                'original_filename': el.original_filename or '',
                'thumbnail_url': el.thumbnail_url or '',
                'element_type': el.element_type,
                'review_summary': review_summary,
                'reviews': [
                    {'session_id': r.session_id, 'author_name': r.author_name, 'action': r.action}
                    for r in el_reviews
                ],
                'likes': likes,
                'dislikes': dislikes,
                'comments': CommentSerializer(el_comments, many=True).data,
            })

        # Stats from pre-fetched reviews
        stats_approved = set()
        stats_changes = set()
        stats_rejected = set()
        for eid in eids:
            for r in reviews_by_element.get(eid, []):
                if r.action == 'approved':
                    stats_approved.add(eid)
                elif r.action == 'changes_requested':
                    stats_changes.add(eid)
                elif r.action == 'rejected':
                    stats_rejected.add(eid)

        stats = {
            'approved': len(stats_approved),
            'changes_requested': len(stats_changes),
            'rejected': len(stats_rejected),
            'total_elements': len(eids),
        }

        # Unread count
        if link.is_expired():
            unread_count = 0
        else:
            uc = unread_by_link_direct.get(link.id, 0)
            for eid in eids:
                uc += unread_by_element.get(eid, 0) + unread_notif_by_element.get(eid, 0)
            unread_count = uc

        link_data = {
            'id': link.id,
            'name': link.name,
            'token': str(link.token),
            'created_at': link.created_at.isoformat(),
            'expires_at': link.expires_at.isoformat() if link.expires_at else None,
            'is_expired': link.is_expired(),
            'unread_count': unread_count,
            'stats': stats,
            'elements': elements_with_feedback,
            'general_comments': CommentSerializer(general_comments_by_link.get(link.id, []), many=True).data,
        }
        if hasattr(link, 'project') and link.project:
            link_data['project_id'] = link.project.id
            link_data['project_name'] = link.project.name
        result.append(link_data)

    return Response({'links': result})


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def mark_comment_read(request, comment_id):
    """PATCH /api/sharing/comments/{id}/read/"""
    comment = get_object_or_404(
        Comment,
        Q(element__project__user=request.user) | Q(scene__project__user=request.user) | Q(shared_link__created_by=request.user),
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
        Q(element__project=project) | Q(scene__project=project) | Q(shared_link__project=project),
        is_read=False,
    ).update(is_read=True)

    try:
        from apps.notifications.models import Notification
        Notification.objects.filter(
            project=project, user=request.user,
            type__in=['comment_new', 'reaction_new', 'review_new'],
            is_read=False,
        ).update(is_read=True)
    except Exception as e:
        logger.warning(f'Failed to sync notification read-all status: {e}')

    return Response(status=status.HTTP_200_OK)
