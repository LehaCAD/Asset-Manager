# Sharing, Comments & Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable project sharing via public links with comments from anonymous reviewers and real-time notifications for the creator.

**Architecture:** Backend extends existing `sharing` app (models, views, urls) and `notifications` app (new model, views, WebSocket consumer). Frontend adds reviewer page, comment threads in DetailPanel, notification bell in Navbar. Two WebSocket channels: project-scoped (comment live updates) and user-scoped (notification bell).

**Tech Stack:** Django 5 + DRF (backend), Next.js 14 + Zustand 5 + shadcn/ui (frontend), Django Channels + Redis (WebSocket), existing JWT auth.

**Spec:** `docs/superpowers/specs/2026-03-31-sharing-comments-notifications-design.md`

---

## File Structure

### Backend — New/Modified

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/apps/sharing/models.py` | Modify | Add `created_by`, `name`, `elements` M2M to SharedLink; rewrite Comment with `element`, `parent`, `author_user`, `session_id` |
| `backend/apps/sharing/serializers.py` | Create | SharedLink CRUD serializers, Comment serializers, PublicProject serializer |
| `backend/apps/sharing/views.py` | Rewrite | SharedLinkViewSet, PublicShareView, PublicCommentView, CommentReadViews |
| `backend/apps/sharing/urls.py` | Create | URL routing for all sharing endpoints |
| `backend/apps/sharing/services.py` | Modify | Update for new model fields, add notify_comment helper |
| `backend/apps/sharing/tests.py` | Rewrite | Update for new model fields, add API tests |
| `backend/apps/sharing/permissions.py` | Create | IsProjectOwner permission class |
| `backend/apps/notifications/models.py` | Create | Notification model |
| `backend/apps/notifications/serializers.py` | Create | NotificationSerializer |
| `backend/apps/notifications/views.py` | Create | NotificationViewSet |
| `backend/apps/notifications/urls.py` | Create | URL routing for notifications |
| `backend/apps/notifications/services.py` | Modify | Add create_notification(), mark_read(), notify via WS |
| `backend/apps/notifications/consumers.py` | Create | NotificationConsumer (user-scoped WS) |
| `backend/apps/projects/consumers.py` | Modify | Update `new_comment` handler (lines 66-71) |
| `backend/apps/projects/routing.py` | Modify | Add `ws/notifications/` route |
| `backend/config/urls.py` | Modify | Add sharing + notifications URL includes (after line 32) |

### Frontend — New/Modified

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/lib/types/index.ts` | Modify | Update SharedLink, Comment, add Notification, WS event types |
| `frontend/lib/api/sharing.ts` | Modify | Update endpoints, add auth comment endpoints |
| `frontend/lib/api/notifications.ts` | Create | Notification API client |
| `frontend/lib/api/notification-ws.ts` | Create | NotificationWebSocketManager (user-scoped) |
| `frontend/lib/store/notifications.ts` | Create | Zustand store for notifications |
| `frontend/app/share/[token]/page.tsx` | Rewrite | Public reviewer page |
| `frontend/components/sharing/ReviewerLightbox.tsx` | Create | Simplified lightbox for reviewer |
| `frontend/components/sharing/CommentThread.tsx` | Create | Reusable comment thread (used by reviewer + creator) |
| `frontend/components/sharing/ReviewerNameInput.tsx` | Create | Name input for anonymous reviewers |
| `frontend/components/sharing/ShareSelectionMode.tsx` | Create | Element selection overlay + floating bar |
| `frontend/components/sharing/CreateLinkDialog.tsx` | Create | Name + expiry dialog after selection |
| `frontend/components/sharing/ShareLinksPanel.tsx` | Create | Link management panel on project page |
| `frontend/components/lightbox/DetailPanel.tsx` | Modify | Replace comment placeholder (lines 287-302) with CommentThread |
| `frontend/components/layout/Navbar.tsx` | Modify | Add notification bell icon + dropdown |
| `frontend/components/layout/NotificationDropdown.tsx` | Create | Bell dropdown with tabs + notification list |
| `frontend/app/(cabinet)/cabinet/notifications/page.tsx` | Rewrite | Full notifications page with real data |

---

## Task 1: Update SharedLink model + migration

**Files:**
- Modify: `backend/apps/sharing/models.py:5-50`
- Create: `backend/apps/sharing/migrations/0003_sharedlink_update.py` (auto-generated)

- [ ] **Step 1: Update SharedLink model**

In `backend/apps/sharing/models.py`, update the SharedLink class:

```python
from django.conf import settings

class SharedLink(models.Model):
    token = models.UUIDField(unique=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        'projects.Project', on_delete=models.CASCADE, related_name='shared_links'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='shared_links'
    )
    name = models.CharField(max_length=100, blank=True, default='')
    elements = models.ManyToManyField('elements.Element', related_name='shared_links')
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"SharedLink {self.token} for {self.project.name}"

    def is_expired(self):
        if not self.expires_at:
            return False
        return self.expires_at < timezone.now()
```

- [ ] **Step 2: Generate and review migration**

Run: `docker compose exec backend python manage.py makemigrations sharing`
Expected: Migration created with AddField(created_by), AddField(name), AddField(elements M2M), AddField(updated_at).

Note: `created_by` needs a default for existing rows. Use a data migration or set a sensible default (e.g., project.user). If existing SharedLinks exist in production, create a separate data migration to populate `created_by` from `shared_link.project.user`.

- [ ] **Step 3: Apply migration**

Run: `docker compose exec backend python manage.py migrate sharing`
Expected: Migration applied successfully.

- [ ] **Step 4: Commit**

```bash
git add backend/apps/sharing/models.py backend/apps/sharing/migrations/
git commit -m "feat(sharing): add created_by, name, elements M2M to SharedLink"
```

---

## Task 2: Rewrite Comment model + migration

**Files:**
- Modify: `backend/apps/sharing/models.py:53-93`
- Create: `backend/apps/sharing/migrations/0004_comment_rewrite.py` (auto-generated)

- [ ] **Step 1: Rewrite Comment model**

Replace the Comment class in `backend/apps/sharing/models.py`:

```python
class Comment(models.Model):
    scene = models.ForeignKey(
        'scenes.Scene', null=True, blank=True,
        on_delete=models.CASCADE, related_name='comments'
    )
    element = models.ForeignKey(
        'elements.Element', null=True, blank=True,
        on_delete=models.CASCADE, related_name='comments'
    )
    parent = models.ForeignKey(
        'self', null=True, blank=True,
        on_delete=models.CASCADE, related_name='replies'
    )
    author_name = models.CharField(max_length=100)
    author_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='comments'
    )
    session_id = models.CharField(max_length=36, default='')
    text = models.TextField(max_length=2000)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(scene__isnull=False, element__isnull=True) |
                    models.Q(scene__isnull=True, element__isnull=False)
                ),
                name='comment_single_target'
            )
        ]

    def __str__(self):
        target = f"element {self.element_id}" if self.element_id else f"scene {self.scene_id}"
        return f"Comment by {self.author_name} on {target}"

    def clean(self):
        super().clean()
        if self.parent:
            if self.parent.element_id != self.element_id or self.parent.scene_id != self.scene_id:
                raise ValidationError('Reply must target the same element/scene as parent.')
```

- [ ] **Step 2: Generate and apply migration**

Run: `docker compose exec backend python manage.py makemigrations sharing && docker compose exec backend python manage.py migrate sharing`
Expected: Migration adds `element`, `parent`, `author_user`, `session_id` fields; changes ordering to ascending; adds constraint.

Note: Existing comments in production have `scene` set. New `element` field is nullable, so existing data is safe. The constraint allows `scene=set, element=null` which matches existing rows.

- [ ] **Step 3: Commit**

```bash
git add backend/apps/sharing/models.py backend/apps/sharing/migrations/
git commit -m "feat(sharing): rewrite Comment model with element, parent, session_id support"
```

---

## Task 3: Create Notification model + migration

**Files:**
- Create: `backend/apps/notifications/models.py`
- Modify: `backend/apps/notifications/apps.py` (verify)

- [ ] **Step 0: Verify notifications app in INSTALLED_APPS**

Check `backend/config/settings.py` — `apps.notifications` should already be in `INSTALLED_APPS` (app exists with `services.py`). If not, add it.

- [ ] **Step 1: Create Notification model**

Create `backend/apps/notifications/models.py`:

```python
from django.conf import settings
from django.db import models


class Notification(models.Model):
    class Type(models.TextChoices):
        COMMENT_NEW = 'comment_new', 'Новый комментарий'
        GENERATION_COMPLETED = 'generation_completed', 'Генерация завершена'
        GENERATION_FAILED = 'generation_failed', 'Ошибка генерации'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='notifications'
    )
    type = models.CharField(max_length=30, choices=Type.choices)

    project = models.ForeignKey(
        'projects.Project', null=True, on_delete=models.CASCADE
    )
    element = models.ForeignKey(
        'elements.Element', null=True, blank=True, on_delete=models.SET_NULL
    )
    scene = models.ForeignKey(
        'scenes.Scene', null=True, blank=True, on_delete=models.SET_NULL
    )
    comment = models.ForeignKey(
        'sharing.Comment', null=True, blank=True, on_delete=models.SET_NULL
    )

    title = models.CharField(max_length=200)
    message = models.TextField(blank=True, default='')

    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'is_read', '-created_at']),
        ]

    def __str__(self):
        return f"{self.type}: {self.title}"
```

- [ ] **Step 2: Verify notifications app in INSTALLED_APPS**

Check `backend/config/settings.py` — verify `'apps.notifications'` is in `INSTALLED_APPS`. It should already be there since `services.py` exists, but confirm before running migrations.

- [ ] **Step 3: Generate and apply migration**

Run: `docker compose exec backend python manage.py makemigrations notifications && docker compose exec backend python manage.py migrate notifications`
Expected: Migration creates `notification` table.

- [ ] **Step 4: Register in admin**

Add to `backend/apps/notifications/admin.py`:

```python
from django.contrib import admin
from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('type', 'user', 'title', 'is_read', 'created_at')
    list_filter = ('type', 'is_read', 'created_at')
    readonly_fields = ('created_at',)
```

- [ ] **Step 5: Commit**

```bash
git add backend/apps/notifications/
git commit -m "feat(notifications): add Notification model with types, indexes, admin"
```

---

## Task 4: Sharing serializers

**Files:**
- Create: `backend/apps/sharing/serializers.py`

- [ ] **Step 1: Create serializers**

Create `backend/apps/sharing/serializers.py`:

```python
from rest_framework import serializers
from .models import SharedLink, Comment


class CommentSerializer(serializers.ModelSerializer):
    replies = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = [
            'id', 'scene', 'element', 'parent',
            'author_name', 'author_user', 'session_id',
            'text', 'is_read', 'created_at', 'replies',
        ]
        read_only_fields = ['id', 'created_at', 'is_read', 'replies']

    def get_replies(self, obj):
        if obj.replies.exists():
            return CommentSerializer(obj.replies.all(), many=True).data
        return []


class CreateCommentAuthSerializer(serializers.Serializer):
    """Creator commenting from workspace (authenticated)."""
    text = serializers.CharField(max_length=2000)
    parent_id = serializers.IntegerField(required=False, allow_null=True)


class CreateCommentPublicSerializer(serializers.Serializer):
    """Reviewer commenting through shared link (anonymous)."""
    text = serializers.CharField(max_length=2000)
    author_name = serializers.CharField(max_length=100)
    session_id = serializers.CharField(max_length=36)
    element_id = serializers.IntegerField(required=False, allow_null=True)
    scene_id = serializers.IntegerField(required=False, allow_null=True)
    parent_id = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, data):
        has_element = data.get('element_id') is not None
        has_scene = data.get('scene_id') is not None
        if has_element == has_scene:
            raise serializers.ValidationError(
                'Exactly one of element_id or scene_id is required.'
            )
        return data


class SharedLinkSerializer(serializers.ModelSerializer):
    element_ids = serializers.PrimaryKeyRelatedField(
        source='elements', many=True, queryset=None,  # set in __init__
        write_only=True,
    )
    element_count = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()
    url = serializers.SerializerMethodField()

    class Meta:
        model = SharedLink
        fields = [
            'id', 'token', 'project', 'name',
            'element_ids', 'element_count', 'comment_count',
            'expires_at', 'created_at', 'url',
        ]
        read_only_fields = ['id', 'token', 'created_at', 'url']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from apps.elements.models import Element
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            self.fields['element_ids'].child_relation.queryset = (
                Element.objects.filter(scene__project__user=request.user)
            )

    def get_element_count(self, obj):
        return obj.elements.count()

    def get_comment_count(self, obj):
        element_ids = obj.elements.values_list('id', flat=True)
        return Comment.objects.filter(element_id__in=element_ids).count()

    def get_url(self, obj):
        return f"/share/{obj.token}"


class PublicElementSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    element_type = serializers.CharField()
    file_url = serializers.CharField()
    thumbnail_url = serializers.CharField()
    comment_count = serializers.IntegerField()


class PublicSceneSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    order_index = serializers.IntegerField()
    elements = PublicElementSerializer(many=True)
    comments = CommentSerializer(many=True)


class PublicProjectSerializer(serializers.Serializer):
    name = serializers.CharField()
    scenes = PublicSceneSerializer(many=True)
    ungrouped_elements = PublicElementSerializer(many=True)
```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/sharing/serializers.py
git commit -m "feat(sharing): add serializers for SharedLink, Comment, public views"
```

---

## Task 5: Sharing permissions + views

**Files:**
- Create: `backend/apps/sharing/permissions.py`
- Rewrite: `backend/apps/sharing/views.py`

- [ ] **Step 1: Create permissions**

Create `backend/apps/sharing/permissions.py`:

```python
from rest_framework.permissions import BasePermission


class IsProjectOwner(BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.project.user == request.user
```

- [ ] **Step 2: Write SharedLink CRUD views**

Rewrite `backend/apps/sharing/views.py`:

```python
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
    from apps.notifications.services import notify_new_comment
    notify_new_comment(comment, link.project)

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
    from apps.notifications.models import Notification
    Notification.objects.filter(comment=comment, user=request.user).update(is_read=True)
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

    from apps.notifications.models import Notification
    Notification.objects.filter(
        project_id=project_id, user=request.user, type='comment_new', is_read=False
    ).update(is_read=True)

    return Response(status=status.HTTP_200_OK)
```

- [ ] **Step 3: Create URL routing**

Create `backend/apps/sharing/urls.py`:

```python
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'links', views.SharedLinkViewSet, basename='shared-link')

urlpatterns = [
    path('', include(router.urls)),
    path('public/<uuid:token>/', views.public_share_view),
    path('public/<uuid:token>/comments/', views.public_comment_view),
    path('elements/<int:element_id>/comments/', views.element_comments_view),
    path('scenes/<int:scene_id>/comments/', views.scene_comments_view),
    path('comments/<int:comment_id>/read/', views.mark_comment_read),
    path('comments/read-all/', views.mark_all_comments_read),
]
```

- [ ] **Step 4: Register in config/urls.py**

In `backend/config/urls.py`, add after line 32 (`path('api/cabinet/', ...)`):

```python
    path('api/sharing/', include('apps.sharing.urls')),
```

- [ ] **Step 5: Rebuild backend container**

Run: `docker compose up --build backend -d`

- [ ] **Step 6: Commit**

```bash
git add backend/apps/sharing/ backend/config/urls.py
git commit -m "feat(sharing): add SharedLink CRUD, public share view, comment endpoints"
```

---

## Task 6: Update sharing services

**Files:**
- Modify: `backend/apps/sharing/services.py`

- [ ] **Step 1: Update services for new model fields**

Rewrite `backend/apps/sharing/services.py` to align with updated models. Key changes:
- `create_shared_link()` now accepts `created_by`, `name`, `element_ids`
- `create_comment()` now accepts `element`, `parent`, `author_user`, `session_id`
- Remove functions that are now handled by views directly (get_scene_comments, etc.)
- Add `get_shared_elements_by_scene()` helper for public view

```python
from django.db import models
from django.db.models import Q
from .models import SharedLink, Comment


def create_shared_link(project, created_by, element_ids, name='', expires_in_days=None):
    from datetime import timedelta
    from django.utils import timezone

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
        models.Q(element__scene__project=project) | models.Q(scene__project=project),
        is_read=False,
    ).exclude(author_user=project.user).count()
```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/sharing/services.py
git commit -m "refactor(sharing): update services for new SharedLink/Comment fields"
```

---

## Task 7: Notification service + WebSocket

**Files:**
- Modify: `backend/apps/notifications/services.py`
- Create: `backend/apps/notifications/consumers.py`
- Modify: `backend/apps/projects/routing.py`
- Modify: `backend/apps/projects/consumers.py:66-71`

- [ ] **Step 1: Extend notification service**

Update `backend/apps/notifications/services.py`:

```python
import logging
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from .models import Notification

logger = logging.getLogger(__name__)


def notify_element_status(element, status, file_url='', error_message='', preview_url='', upload_progress=None):
    """Existing function — keep as-is, sends to project channel."""
    # ... existing code unchanged ...


def create_notification(user, type, project, title, message='', element=None, scene=None, comment=None):
    """Create persistent notification + send via user-scoped WebSocket."""
    notification = Notification.objects.create(
        user=user,
        type=type,
        project=project,
        element=element,
        scene=scene,
        comment=comment,
        title=title,
        message=message,
    )

    # Send via WebSocket to user channel
    try:
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f'user_{user.id}',
                {
                    'type': 'new_notification',
                    'notification': {
                        'id': notification.id,
                        'type': notification.type,
                        'title': notification.title,
                        'message': notification.message,
                        'project_id': project.id if project else None,
                        'element_id': element.id if element else None,
                        'scene_id': scene.id if scene else None,
                        'created_at': notification.created_at.isoformat(),
                    },
                },
            )
    except Exception as e:
        logger.warning(f'Failed to send WS notification: {e}')

    return notification


def notify_new_comment(comment, project):
    """Called when a reviewer or creator leaves a comment."""
    owner = project.user

    # Don't notify yourself
    if comment.author_user and comment.author_user == owner:
        return

    title = f'Новый комментарий от {comment.author_name}'
    message = comment.text[:100]

    create_notification(
        user=owner,
        type=Notification.Type.COMMENT_NEW,
        project=project,
        title=title,
        message=message,
        element=comment.element,
        scene=comment.scene,
        comment=comment,
    )

    # Also send to project channel for live comment thread updates
    # Format matches updated ProjectConsumer.new_comment handler (see Step 4 below)
    try:
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f'project_{project.id}',
                {
                    'type': 'new_comment',
                    'comment': {
                        'id': comment.id,
                        'element_id': comment.element_id,
                        'scene_id': comment.scene_id,
                        'author_name': comment.author_name,
                        'text': comment.text[:100],
                        'created_at': comment.created_at.isoformat(),
                    },
                },
            )
    except Exception as e:
        logger.warning(f'Failed to send WS comment: {e}')
```

- [ ] **Step 2: Create NotificationConsumer**

Create `backend/apps/notifications/consumers.py`:

```python
from channels.generic.websocket import AsyncJsonWebsocketConsumer


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = self.scope.get('user')
        if not self.user or not self.user.is_authenticated:
            await self.close()
            return

        self.group_name = f'user_{self.user.id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content):
        if content.get('type') == 'ping':
            await self.send_json({'type': 'pong'})

    async def new_notification(self, event):
        await self.send_json(event)
```

- [ ] **Step 3: Update ProjectConsumer.new_comment handler**

In `backend/apps/projects/consumers.py`, update the `new_comment` stub (lines 66-71) to forward the comment data:

```python
    async def new_comment(self, event):
        """Forward new comment to connected clients."""
        await self.send_json({
            'type': 'new_comment',
            'comment_id': event['comment']['id'],
            'element_id': event['comment']['element_id'],
            'scene_id': event['comment']['scene_id'],
            'author_name': event['comment']['author_name'],
            'text': event['comment']['text'],
            'created_at': event['comment']['created_at'],
        })
```

- [ ] **Step 4: Update WebSocket routing**

In `backend/apps/projects/routing.py`, add NotificationConsumer route:

```python
from django.urls import re_path
from apps.projects.consumers import ProjectConsumer
from apps.notifications.consumers import NotificationConsumer

websocket_urlpatterns = [
    re_path(r'ws/projects/(?P<project_id>\d+)/$', ProjectConsumer.as_asgi()),
    re_path(r'ws/notifications/$', NotificationConsumer.as_asgi()),
]
```

- [ ] **Step 4: Commit**

```bash
git add backend/apps/notifications/ backend/apps/projects/routing.py
git commit -m "feat(notifications): add Notification service, NotificationConsumer WS, routing"
```

---

## Task 8: Notification views + URLs

**Files:**
- Create: `backend/apps/notifications/serializers.py`
- Create: `backend/apps/notifications/views.py`
- Create: `backend/apps/notifications/urls.py`
- Modify: `backend/config/urls.py`

- [ ] **Step 1: Create notification serializer**

Create `backend/apps/notifications/serializers.py`:

```python
from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            'id', 'type', 'project', 'element', 'scene', 'comment',
            'title', 'message', 'is_read', 'created_at',
        ]
```

- [ ] **Step 2: Create notification views**

Create `backend/apps/notifications/views.py`:

```python
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

    # Cursor-based pagination (simple offset for MVP)
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
```

- [ ] **Step 3: Create notification URLs**

Create `backend/apps/notifications/urls.py`:

```python
from django.urls import path
from . import views

urlpatterns = [
    path('', views.notification_list),
    path('unread-count/', views.unread_count),
    path('<int:notification_id>/read/', views.mark_read),
    path('read-all/', views.mark_all_read),
]
```

- [ ] **Step 4: Register in config/urls.py**

Add to `backend/config/urls.py` (after the sharing include):

```python
    path('api/notifications/', include('apps.notifications.urls')),
```

- [ ] **Step 5: Commit**

```bash
git add backend/apps/notifications/ backend/config/urls.py
git commit -m "feat(notifications): add notification list, unread count, mark read endpoints"
```

---

## Task 9: Update sharing tests

**Files:**
- Modify: `backend/apps/sharing/tests.py`

- [ ] **Step 1: Update model tests for new fields**

Update existing test classes in `backend/apps/sharing/tests.py` to account for:
- SharedLink now requires `created_by`
- Comment now has `element`, `parent`, `session_id` fields
- Comment ordering changed to ascending `created_at`
- New `comment_single_target` constraint

Add new test cases:
- Test Comment with `element` target (not just `scene`)
- Test Comment `clean()` validates parent target matches
- Test `comment_single_target` constraint rejects both null or both set
- Test SharedLink with `elements` M2M
- Test API endpoints (SharedLink CRUD, public view, public comment)

- [ ] **Step 2: Run tests**

Run: `docker compose exec backend python manage.py test apps.sharing -v2`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/apps/sharing/tests.py
git commit -m "test(sharing): update tests for new model fields and API endpoints"
```

---

## Task 10: Frontend types update

**Files:**
- Modify: `frontend/lib/types/index.ts`

- [ ] **Step 1: Update TypeScript types**

In `frontend/lib/types/index.ts`, update/add these interfaces:

Update `SharedLink` (around line 311):
```typescript
export interface SharedLink {
  id: number
  token: string
  project: number
  created_by: number
  name: string
  element_ids: number[]
  element_count: number
  comment_count: number
  expires_at: string | null
  created_at: string
  url: string
}
```

Update `Comment` (around line 349):
```typescript
export interface Comment {
  id: number
  element: number | null
  scene: number | null
  parent: number | null
  author_name: string
  author_user: number | null
  session_id: string
  text: string
  is_read: boolean
  created_at: string
  replies: Comment[]
}
```

Add `Notification`:
```typescript
export type NotificationType = 'comment_new' | 'generation_completed' | 'generation_failed'

export interface Notification {
  id: number
  type: NotificationType
  project: number | null
  element: number | null
  scene: number | null
  comment: number | null
  title: string
  message: string
  is_read: boolean
  created_at: string
}
```

Update `WSEvent` union (around line 377):
```typescript
export interface WSNewCommentEvent {
  type: 'new_comment'
  comment_id: number
  element_id: number | null
  scene_id: number | null
  author_name: string
  text: string
  created_at: string
}

export interface WSNewNotificationEvent {
  type: 'new_notification'
  notification: Notification
}

// Project-scoped WS events (existing wsManager)
export type WSEvent = WSElementStatusChangedEvent | WSNewCommentEvent
// Note: WSNewNotificationEvent goes through separate notificationWS (user-scoped channel)
```

Update `PublicElement` (around line 331):
```typescript
export interface PublicElement {
  id: number
  element_type: ElementType
  file_url: string
  thumbnail_url: string
  comment_count: number
}
```

Update `PublicProject` (around line 324):
```typescript
export interface PublicProject {
  name: string
  scenes: PublicScene[]
  ungrouped_elements: PublicElement[]
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/types/index.ts
git commit -m "feat(types): update SharedLink, Comment, add Notification and WS event types"
```

---

## Task 11: Frontend API clients

**Files:**
- Modify: `frontend/lib/api/sharing.ts`
- Create: `frontend/lib/api/notifications.ts`

- [ ] **Step 1: Update sharing API client**

Update `frontend/lib/api/sharing.ts` to match new endpoints:

```typescript
import { apiClient } from './client'
import type {
  SharedLink, Comment, CreateCommentPayload,
  PublicProject,
} from '@/lib/types'

// Use separate axios instance for public endpoints (no auth)
import axios from 'axios'
const publicClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
})

export const sharingApi = {
  // SharedLink CRUD (authenticated)
  getLinks: (projectId: number) =>
    apiClient.get<SharedLink[]>(`/api/sharing/links/`, { params: { project: projectId } })
      .then(r => r.data),

  createLink: (data: { project: number; element_ids: number[]; name?: string; expires_at?: string }) =>
    apiClient.post<SharedLink>('/api/sharing/links/', data).then(r => r.data),

  updateLink: (id: number, data: { name?: string; element_ids?: number[]; expires_at?: string }) =>
    apiClient.patch<SharedLink>(`/api/sharing/links/${id}/`, data).then(r => r.data),

  deleteLink: (id: number) =>
    apiClient.delete(`/api/sharing/links/${id}/`),

  // Comments — authenticated (creator workspace)
  getElementComments: (elementId: number) =>
    apiClient.get<Comment[]>(`/api/sharing/elements/${elementId}/comments/`).then(r => r.data),

  getSceneComments: (sceneId: number) =>
    apiClient.get<Comment[]>(`/api/sharing/scenes/${sceneId}/comments/`).then(r => r.data),

  addElementComment: (elementId: number, text: string, parentId?: number) =>
    apiClient.post<Comment>(`/api/sharing/elements/${elementId}/comments/`, {
      text, parent_id: parentId,
    }).then(r => r.data),

  addSceneComment: (sceneId: number, text: string, parentId?: number) =>
    apiClient.post<Comment>(`/api/sharing/scenes/${sceneId}/comments/`, {
      text, parent_id: parentId,
    }).then(r => r.data),

  markCommentRead: (commentId: number) =>
    apiClient.patch(`/api/sharing/comments/${commentId}/read/`),

  markAllCommentsRead: (projectId: number) =>
    apiClient.post('/api/sharing/comments/read-all/', { project_id: projectId }),

  // Public (reviewer, no auth)
  getPublicProject: (token: string) =>
    publicClient.get<PublicProject>(`/api/sharing/public/${token}/`).then(r => r.data),

  addPublicComment: (token: string, data: {
    text: string; author_name: string; session_id: string;
    element_id?: number; scene_id?: number; parent_id?: number;
  }) =>
    publicClient.post<Comment>(`/api/sharing/public/${token}/comments/`, data).then(r => r.data),
}
```

- [ ] **Step 2: Create notifications API client**

Create `frontend/lib/api/notifications.ts`:

```typescript
import { apiClient } from './client'
import type { Notification } from '@/lib/types'

interface NotificationListResponse {
  results: Notification[]
  has_more: boolean
  next_offset: number | null
}

export const notificationsApi = {
  list: (params?: { type?: string; is_read?: boolean; offset?: number }) =>
    apiClient.get<NotificationListResponse>('/api/notifications/', { params })
      .then(r => r.data),

  unreadCount: () =>
    apiClient.get<{ count: number }>('/api/notifications/unread-count/')
      .then(r => r.data.count),

  markRead: (id: number) =>
    apiClient.patch(`/api/notifications/${id}/read/`),

  markAllRead: () =>
    apiClient.post('/api/notifications/read-all/'),
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api/sharing.ts frontend/lib/api/notifications.ts
git commit -m "feat(api): update sharing client, add notifications client"
```

---

## Task 12: Notification WebSocket manager + Zustand store

**Files:**
- Create: `frontend/lib/api/notification-ws.ts`
- Create: `frontend/lib/store/notifications.ts`

- [ ] **Step 1: Create notification WS manager**

Create `frontend/lib/api/notification-ws.ts`:

```typescript
import type { WSNewNotificationEvent } from '@/lib/types'

type NotificationHandler = (event: WSNewNotificationEvent) => void

class NotificationWSManager {
  private ws: WebSocket | null = null
  private handlers: NotificationHandler[] = []
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectTimer: NodeJS.Timeout | null = null

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || ''
    let token = ''

    // Get token from cookie or localStorage (same as existing wsManager)
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/access_token=([^;]+)/)
      if (match) token = match[1]
    }
    if (!token && typeof localStorage !== 'undefined') {
      try {
        const stored = JSON.parse(localStorage.getItem('auth-storage') || '{}')
        token = stored?.state?.accessToken || ''
      } catch {}
    }
    if (!token) return

    this.ws = new WebSocket(`${wsUrl}/ws/notifications/?token=${token}`)

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'new_notification') {
          this.handlers.forEach(h => h(data))
        }
      } catch {}
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
    }

    this.ws.onclose = () => {
      this.scheduleReconnect()
    }
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }

  on(handler: NotificationHandler) {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler)
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++
      this.connect()
    }, delay)
  }
}

export const notificationWS = new NotificationWSManager()
```

- [ ] **Step 2: Create notification store**

Create `frontend/lib/store/notifications.ts`:

```typescript
import { create } from 'zustand'
import { notificationsApi } from '@/lib/api/notifications'
import type { Notification } from '@/lib/types'

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  hasMore: boolean
  isLoading: boolean

  fetchUnreadCount: () => Promise<void>
  fetchNotifications: (offset?: number) => Promise<void>
  markRead: (id: number) => Promise<void>
  markAllRead: () => Promise<void>
  addNotification: (notification: Notification) => void
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  hasMore: false,
  isLoading: false,

  fetchUnreadCount: async () => {
    try {
      const count = await notificationsApi.unreadCount()
      set({ unreadCount: count })
    } catch {}
  },

  fetchNotifications: async (offset = 0) => {
    set({ isLoading: true })
    try {
      const data = await notificationsApi.list({ offset })
      set(state => ({
        notifications: offset === 0 ? data.results : [...state.notifications, ...data.results],
        hasMore: data.has_more,
        isLoading: false,
      }))
    } catch {
      set({ isLoading: false })
    }
  },

  markRead: async (id) => {
    await notificationsApi.markRead(id)
    set(state => ({
      notifications: state.notifications.map(n =>
        n.id === id ? { ...n, is_read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }))
  },

  markAllRead: async () => {
    await notificationsApi.markAllRead()
    set(state => ({
      notifications: state.notifications.map(n => ({ ...n, is_read: true })),
      unreadCount: 0,
    }))
  },

  addNotification: (notification) => {
    set(state => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }))
  },
}))
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api/notification-ws.ts frontend/lib/store/notifications.ts
git commit -m "feat(notifications): add WS manager and Zustand store"
```

---

## Task 13: CommentThread component

**Files:**
- Create: `frontend/components/sharing/CommentThread.tsx`

- [ ] **Step 1: Create reusable CommentThread component**

Create `frontend/components/sharing/CommentThread.tsx`:

This component is used in both the reviewer lightbox and the creator's DetailPanel. It renders a flat list of comments with reply-to indicators, an input field, and handles both authenticated and anonymous modes.

Props:
```typescript
interface CommentThreadProps {
  comments: Comment[]
  onSubmit: (text: string, parentId?: number) => Promise<void>
  isAuthenticated: boolean  // determines if name input shown
  authorName?: string       // for anonymous: stored name
  onNameRequired?: () => void  // trigger name input
  isLoading?: boolean
}
```

Key behaviors:
- Renders comments oldest-first
- Reply shows quoted parent (name + first 50 chars)
- Click "Ответить" on a comment → sets replyTo state → input shows quote
- One level of visual nesting for replies
- Colored avatar circles derived from `session_id` (hash to hue)
- Timestamps in relative format ("5 мин назад")

- [ ] **Step 2: Commit**

```bash
git add frontend/components/sharing/CommentThread.tsx
git commit -m "feat(sharing): add reusable CommentThread component"
```

---

## Task 14: Reviewer page `/share/[token]`

**Files:**
- Rewrite: `frontend/app/share/[token]/page.tsx`
- Create: `frontend/components/sharing/ReviewerLightbox.tsx`
- Create: `frontend/components/sharing/ReviewerNameInput.tsx`

- [ ] **Step 1: Build reviewer page**

Rewrite `frontend/app/share/[token]/page.tsx`:

Responsibilities:
- Fetch public project data via `sharingApi.getPublicProject(token)`
- Manage reviewer identity (name + session_id in localStorage)
- Render scenes as collapsible accordions (open by default, ▼ to collapse)
- Flat grid if single scene / no scenes
- Element cards with 💬 badge (comment_count)
- Click element → opens ReviewerLightbox
- Scene-level comment thread under each scene header
- CTA footer: "Создавайте свои проекты на Раскадровке →"
- Handle expired link (410 → "Срок ссылки истёк")
- Handle empty link (no elements → "Элементы были удалены")

- [ ] **Step 2: Build ReviewerLightbox**

Create `frontend/components/sharing/ReviewerLightbox.tsx`:

Simplified version of existing LightboxModal:
- Image/video display with controls
- ← → navigation through shared elements only
- Filmstrip at bottom
- Right panel: CommentThread (instead of DetailPanel)
- No edit actions (no delete, favorite, prompt, retry)
- Keyboard: ← → navigate, Esc close

- [ ] **Step 3: Build ReviewerNameInput**

Create `frontend/components/sharing/ReviewerNameInput.tsx`:

Inline name prompt shown when user first tries to comment:
- "Как вас зовут?" + text input + OK button
- Saves name + generates session_id (UUID) in localStorage
- Compact, appears inside the comment input area

- [ ] **Step 4: Test manually**

Open `http://localhost:3000/share/{some-token}` — verify page loads, elements display, lightbox opens, comments can be submitted.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/share/ frontend/components/sharing/
git commit -m "feat(sharing): add reviewer page with lightbox and comment thread"
```

---

## Task 15: Comments in creator's DetailPanel

**Files:**
- Modify: `frontend/components/lightbox/DetailPanel.tsx:287-302`

- [ ] **Step 1: Replace comment placeholder with CommentThread**

In `frontend/components/lightbox/DetailPanel.tsx`, replace the disabled textarea placeholder (lines 287-302) with:

- Fetch comments via `sharingApi.getElementComments(element.id)` on element change
- Render `<CommentThread>` with `isAuthenticated={true}`
- Submit via `sharingApi.addElementComment()`
- Listen for WS `new_comment` events to add comments in real-time
- Show unread badge count
- Mark comments as read when viewing (call `markCommentRead`)

- [ ] **Step 2: Add comment badge to ElementCard**

In the element card component (in the element grid), add a small 💬 badge showing unread comment count. This requires fetching comment counts — either via a new field on the element list response or a separate lightweight endpoint.

- [ ] **Step 3: Test manually**

Open a project in workspace → open lightbox → verify comments load, can submit, replies work, WS updates appear.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/lightbox/DetailPanel.tsx frontend/components/element/
git commit -m "feat(sharing): integrate CommentThread in DetailPanel, add comment badges"
```

---

## Task 16: Share selection mode + create link dialog

**Files:**
- Create: `frontend/components/sharing/ShareSelectionMode.tsx`
- Create: `frontend/components/sharing/CreateLinkDialog.tsx`
- Create: `frontend/components/sharing/ShareLinksPanel.tsx`

- [ ] **Step 1: Build ShareSelectionMode**

Create `frontend/components/sharing/ShareSelectionMode.tsx`:

Overlay component that activates when "Поделиться" is clicked:
- Adds checkboxes to element cards
- Filter bar: Все | Фото | Видео | ★ Избранное
- "Выбрать все видимые" button
- Selection persists across scene navigation
- Floating bottom bar: "Выбрано: N элементов" + "Создать ссылку" / "Отмена"
- State management: local state (Set<number> of selected element IDs)

- [ ] **Step 2: Build CreateLinkDialog**

Create `frontend/components/sharing/CreateLinkDialog.tsx`:

Modal dialog shown after clicking "Создать ссылку":
- Name input (optional): "Название ссылки"
- Expiry select: Без ограничений / 7 дней / 30 дней / Свой срок
- "Создать" button → calls `sharingApi.createLink()`
- On success: copies link to clipboard, shows toast "Ссылка скопирована"
- Closes selection mode

- [ ] **Step 3: Build ShareLinksPanel**

Create `frontend/components/sharing/ShareLinksPanel.tsx`:

Panel/section on project page showing active shared links:
- List of links: name (or "Без названия"), date, element count, comment count (with unread badge)
- Actions per link: copy URL, edit (opens dialog), delete (with confirmation)
- "Поделиться" button to enter selection mode

- [ ] **Step 4: Integrate into project workspace page**

Add ShareLinksPanel to the project page layout. Add "Поделиться" button trigger. Wire up ShareSelectionMode overlay.

- [ ] **Step 5: Test manually**

Enter selection mode → select elements → create link → verify link works in `/share/{token}`.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/sharing/
git commit -m "feat(sharing): add element selection mode, create link dialog, links panel"
```

---

## Task 17: Notification bell in Navbar

**Files:**
- Create: `frontend/components/layout/NotificationDropdown.tsx`
- Modify: `frontend/components/layout/Navbar.tsx`

- [ ] **Step 1: Create NotificationDropdown**

Create `frontend/components/layout/NotificationDropdown.tsx`:

Dropdown component triggered by bell icon click:
- Tabs: Все | Комментарии | Генерации
- List of last 10 notifications (from store)
- Each item: icon (💬/✓/✗) + title + message preview + relative time
- Unread items have accent background
- Click item → navigate to project/element:
  - `comment_new` → `/projects/{id}?element={elementId}&lightbox=true`
  - `generation_completed/failed` → same pattern
  - Mark as read on click
- "Все уведомления →" link to `/cabinet/notifications`
- "Отметить все прочитанными" button

- [ ] **Step 2: Add bell icon to Navbar**

In `frontend/components/layout/Navbar.tsx` (around line 73, before user menu):

- Bell icon (Lucide `Bell`)
- Red badge with unread count (from `useNotificationStore.unreadCount`)
- Click opens NotificationDropdown (Popover from shadcn/ui)
- Connect `notificationWS` on mount, subscribe to events
- Fallback: poll `unreadCount` every 30s if WS disconnected

- [ ] **Step 3: Test manually**

Verify: bell shows in navbar, unread count updates, dropdown opens, clicking navigates correctly.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/layout/
git commit -m "feat(notifications): add bell icon with dropdown in Navbar"
```

---

## Task 18: Notifications page in cabinet

**Files:**
- Rewrite: `frontend/app/(cabinet)/cabinet/notifications/page.tsx`

- [ ] **Step 1: Build full notifications page**

Rewrite `frontend/app/(cabinet)/cabinet/notifications/page.tsx`:

- Uses `useNotificationStore` for data
- Tabs: Все | Комментарии | Генерации (filter by `type`)
- Paginated list (load more on scroll/button)
- Each notification: type icon, title, message, relative time, read/unread state
- Click → navigate to source (same as dropdown)
- "Отметить все прочитанными" button in header
- Empty state: "Пока уведомлений нет"

- [ ] **Step 2: Test manually**

Navigate to `/cabinet/notifications` → verify list loads, filtering works, pagination works.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/(cabinet)/cabinet/notifications/
git commit -m "feat(notifications): build full notifications page in cabinet"
```

---

## Task 19: Wire generation notifications (backend)

**Files:**
- Modify: `backend/apps/elements/generation.py:194-204`
- Modify: `backend/apps/notifications/services.py`

- [ ] **Step 1: Add generation notifications to finalize functions**

In `backend/apps/elements/generation.py`, after `finalize_generation_success()` and `finalize_generation_failure()`, create Notification records. Note: these functions work with `element_id` (int), so fetch the element instance first:

```python
from apps.notifications.services import create_notification
from apps.notifications.models import Notification
from apps.elements.models import Element

# In finalize_generation_success (around line 191):
# element_id is already available in the function. Fetch the instance:
el = Element.objects.select_related('project__user', 'scene').get(id=element_id)
create_notification(
    user=el.project.user,
    type=Notification.Type.GENERATION_COMPLETED,
    project=el.project,
    title='Генерация завершена',
    message=el.prompt_text[:100] if el.prompt_text else '',
    element=el,
    scene=el.scene,  # can be None, that's fine
)

# In finalize_generation_failure (around line 204):
el = Element.objects.select_related('project__user', 'scene').get(id=element_id)
create_notification(
    user=el.project.user,
    type=Notification.Type.GENERATION_FAILED,
    project=el.project,
    title='Ошибка генерации',
    message=error_message[:100] if error_message else '',
    element=el,
    scene=el.scene,
)
```

- [ ] **Step 2: Test manually**

Trigger a generation → verify notification appears in bell icon.

- [ ] **Step 3: Commit**

```bash
git add backend/apps/elements/generation.py
git commit -m "feat(notifications): create persistent notifications on generation complete/fail"
```

---

## Task 20: End-to-end smoke test

- [ ] **Step 1: Full flow — creator side**

1. Open project in workspace
2. Click "Поделиться" → enter selection mode
3. Filter by ★ favorites → "Выбрать все видимые"
4. Click "Создать ссылку" → name it → copy URL
5. Verify link appears in ShareLinksPanel

- [ ] **Step 2: Full flow — reviewer side**

1. Open shared link in incognito browser
2. Verify elements display grouped by scenes (accordions)
3. Click element → lightbox opens
4. Enter name → leave comment
5. Navigate to another element → leave reply to existing comment

- [ ] **Step 3: Full flow — notifications**

1. Back in creator's browser → verify bell icon shows unread count
2. Click bell → see comment notification
3. Click notification → opens lightbox on commented element
4. Comment thread shows reviewer's comments
5. Reply as creator → verify reply visible

- [ ] **Step 4: Full flow — cabinet**

1. Navigate to /cabinet/notifications
2. Verify all notifications listed
3. Filter by "Комментарии" → only comment notifications
4. "Отметить все прочитанными" → badge clears

- [ ] **Step 5: Edge cases**

1. Delete a shared element → verify reviewer page handles gracefully
2. Open expired link → verify "Срок ссылки истёк" page
3. Delete shared link → verify reviewer gets appropriate error

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: sharing, comments, and notifications — complete implementation"
```
