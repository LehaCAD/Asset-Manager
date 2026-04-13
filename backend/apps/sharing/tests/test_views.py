"""Comprehensive tests for sharing views: public share, comments, reactions, reviews."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.elements.models import Element
from apps.notifications.models import Notification
from apps.projects.models import Project
from apps.scenes.models import Scene
from apps.sharing.models import Comment, ElementReaction, ElementReview, SharedLink

User = get_user_model()


class SharingViewTestBase(TestCase):
    """Base class with common setUp for all sharing view tests."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username='owner', email='owner@example.com', password='pass123'
        )
        self.project = Project.objects.create(user=self.owner, name='Test Project')
        self.scene = Scene.objects.create(
            project=self.project, name='Scene 1', order_index=0
        )
        self.element = Element.objects.create(
            project=self.project, scene=self.scene,
            element_type='IMAGE', status='COMPLETED',
            source_type='GENERATED',
        )
        self.link = SharedLink.objects.create(
            project=self.project, created_by=self.owner
        )
        self.link.elements.add(self.element)
        self.client = APIClient()


# ─────────────────────────────────────────────────────────────────────
# 1. comment_count excludes system comments
# ─────────────────────────────────────────────────────────────────────
@override_settings(REST_FRAMEWORK={'DEFAULT_THROTTLE_RATES': {'anon': '1000/min', 'user': '1000/min'}})
class CommentCountExcludesSystemTest(SharingViewTestBase):

    def test_comment_count_excludes_system_comments(self):
        """Public share view annotation must NOT count is_system=True comments."""
        Comment.objects.create(
            element=self.element, author_name='Guest1',
            session_id='s1', text='Nice',
        )
        Comment.objects.create(
            element=self.element, author_name='Guest2',
            session_id='s2', text='Cool',
        )
        Comment.objects.create(
            element=self.element, author_name='System',
            session_id='sys', text='Review started', is_system=True,
        )

        resp = self.client.get(f'/api/sharing/public/{self.link.token}/')
        self.assertEqual(resp.status_code, 200)

        # Element is in a scene
        scenes = resp.data['scenes']
        self.assertEqual(len(scenes), 1)
        el_data = scenes[0]['elements'][0]
        self.assertEqual(el_data['comment_count'], 2)

    def test_comment_count_zero_when_only_system(self):
        Comment.objects.create(
            element=self.element, author_name='System',
            session_id='sys', text='Auto', is_system=True,
        )
        resp = self.client.get(f'/api/sharing/public/{self.link.token}/')
        self.assertEqual(resp.status_code, 200)
        el_data = resp.data['scenes'][0]['elements'][0]
        self.assertEqual(el_data['comment_count'], 0)


# ─────────────────────────────────────────────────────────────────────
# 2. Session ID collision prevention
# ─────────────────────────────────────────────────────────────────────
@override_settings(REST_FRAMEWORK={'DEFAULT_THROTTLE_RATES': {'anon': '1000/min', 'user': '1000/min'}})
class SessionIdCollisionTest(SharingViewTestBase):

    def test_guest_and_user_session_ids_are_separate(self):
        """Guest session_id='1' and user session_id='user_1' must create separate reactions."""
        url = f'/api/sharing/public/{self.link.token}/reactions/'

        # Guest reacts with session_id "1"
        resp1 = self.client.post(url, {
            'element_id': self.element.id,
            'session_id': '1',
            'value': 'like',
            'author_name': 'Guest',
        })
        self.assertEqual(resp1.status_code, 200)

        # Auth user reacts with session_id "user_1"
        resp2 = self.client.post(url, {
            'element_id': self.element.id,
            'session_id': 'user_1',
            'value': 'dislike',
            'author_name': 'Owner',
        })
        self.assertEqual(resp2.status_code, 200)

        reactions = ElementReaction.objects.filter(element=self.element)
        self.assertEqual(reactions.count(), 2)
        self.assertEqual(reactions.filter(session_id='1', value='like').count(), 1)
        self.assertEqual(reactions.filter(session_id='user_1', value='dislike').count(), 1)

    def test_same_session_id_updates_not_duplicates(self):
        """Same session_id must update existing reaction, not create duplicate."""
        url = f'/api/sharing/public/{self.link.token}/reactions/'

        self.client.post(url, {
            'element_id': self.element.id,
            'session_id': 'guest_abc',
            'value': 'like',
            'author_name': 'Guest',
        })
        self.client.post(url, {
            'element_id': self.element.id,
            'session_id': 'guest_abc',
            'value': 'dislike',
            'author_name': 'Guest',
        })

        reactions = ElementReaction.objects.filter(element=self.element, session_id='guest_abc')
        self.assertEqual(reactions.count(), 1)
        self.assertEqual(reactions.first().value, 'dislike')


# ─────────────────────────────────────────────────────────────────────
# 3. Review worst-wins aggregation (model-level)
# ─────────────────────────────────────────────────────────────────────
class ReviewWorstWinsTest(SharingViewTestBase):

    def _get_summary(self):
        """Compute worst-wins summary from reviews on self.element."""
        reviews = ElementReview.objects.filter(element=self.element)
        if not reviews.exists():
            return None
        priority = {'rejected': 0, 'changes_requested': 1, 'approved': 2}
        worst = min(reviews, key=lambda r: priority.get(r.action, 99))
        return worst.action

    def test_approved_plus_rejected_returns_rejected(self):
        ElementReview.objects.create(
            element=self.element, session_id='s1', action='approved'
        )
        ElementReview.objects.create(
            element=self.element, session_id='s2', action='rejected'
        )
        self.assertEqual(self._get_summary(), 'rejected')

    def test_approved_plus_changes_requested_returns_changes_requested(self):
        ElementReview.objects.create(
            element=self.element, session_id='s1', action='approved'
        )
        ElementReview.objects.create(
            element=self.element, session_id='s2', action='changes_requested'
        )
        self.assertEqual(self._get_summary(), 'changes_requested')

    def test_all_approved_returns_approved(self):
        ElementReview.objects.create(
            element=self.element, session_id='s1', action='approved'
        )
        ElementReview.objects.create(
            element=self.element, session_id='s2', action='approved'
        )
        self.assertEqual(self._get_summary(), 'approved')

    def test_no_reviews_returns_none(self):
        self.assertIsNone(self._get_summary())


# ─────────────────────────────────────────────────────────────────────
# 4. Expired link returns 410
# ─────────────────────────────────────────────────────────────────────
@override_settings(REST_FRAMEWORK={'DEFAULT_THROTTLE_RATES': {'anon': '1000/min', 'user': '1000/min'}})
class ExpiredLinkTest(SharingViewTestBase):

    def setUp(self):
        super().setUp()
        self.link.expires_at = timezone.now() - timedelta(days=1)
        self.link.save()

    def test_public_share_view_returns_410(self):
        resp = self.client.get(f'/api/sharing/public/{self.link.token}/')
        self.assertEqual(resp.status_code, 410)

    def test_public_comment_returns_410(self):
        resp = self.client.post(f'/api/sharing/public/{self.link.token}/comments/', {
            'text': 'Hello',
            'author_name': 'Guest',
            'session_id': 'abc',
            'element_id': self.element.id,
        })
        self.assertEqual(resp.status_code, 410)

    def test_public_reaction_returns_410(self):
        resp = self.client.post(f'/api/sharing/public/{self.link.token}/reactions/', {
            'element_id': self.element.id,
            'session_id': 'abc',
            'value': 'like',
        })
        self.assertEqual(resp.status_code, 410)

    def test_public_review_returns_410(self):
        resp = self.client.post(f'/api/sharing/public/{self.link.token}/review/', {
            'element_id': self.element.id,
            'session_id': 'abc',
            'action': 'approved',
        })
        self.assertEqual(resp.status_code, 410)


# ─────────────────────────────────────────────────────────────────────
# 5. Comment validation
# ─────────────────────────────────────────────────────────────────────
@override_settings(REST_FRAMEWORK={'DEFAULT_THROTTLE_RATES': {'anon': '1000/min', 'user': '1000/min'}})
class CommentValidationTest(SharingViewTestBase):

    def _comment_url(self):
        return f'/api/sharing/public/{self.link.token}/comments/'

    def test_element_not_in_link_returns_400(self):
        other_element = Element.objects.create(
            project=self.project, scene=self.scene,
            element_type='IMAGE', status='COMPLETED',
            source_type='GENERATED',
        )
        # Not added to self.link
        resp = self.client.post(self._comment_url(), {
            'text': 'Comment on wrong element',
            'author_name': 'Guest',
            'session_id': 'abc',
            'element_id': other_element.id,
        })
        self.assertEqual(resp.status_code, 400)

    def test_parent_from_different_element_returns_400(self):
        other_element = Element.objects.create(
            project=self.project, scene=self.scene,
            element_type='IMAGE', status='COMPLETED',
            source_type='GENERATED',
        )
        self.link.elements.add(other_element)
        parent = Comment.objects.create(
            element=other_element, author_name='A', session_id='x', text='Parent'
        )
        resp = self.client.post(self._comment_url(), {
            'text': 'Reply to wrong parent',
            'author_name': 'Guest',
            'session_id': 'abc',
            'element_id': self.element.id,
            'parent_id': parent.id,
        })
        self.assertEqual(resp.status_code, 400)

    def test_empty_text_returns_400(self):
        resp = self.client.post(self._comment_url(), {
            'text': '',
            'author_name': 'Guest',
            'session_id': 'abc',
            'element_id': self.element.id,
        })
        self.assertEqual(resp.status_code, 400)

    def test_html_stripped_from_text(self):
        resp = self.client.post(self._comment_url(), {
            'text': '<b>Bold</b> <script>alert("xss")</script> text',
            'author_name': 'Guest',
            'session_id': 'abc',
            'element_id': self.element.id,
        })
        self.assertEqual(resp.status_code, 201)
        comment = Comment.objects.filter(element=self.element).last()
        self.assertNotIn('<b>', comment.text)
        self.assertNotIn('<script>', comment.text)
        self.assertIn('Bold', comment.text)
        self.assertIn('text', comment.text)

    def test_html_stripped_from_author_name(self):
        resp = self.client.post(self._comment_url(), {
            'text': 'Hello',
            'author_name': '<img src=x onerror=alert(1)>Hacker',
            'session_id': 'abc',
            'element_id': self.element.id,
        })
        self.assertEqual(resp.status_code, 201)
        comment = Comment.objects.filter(element=self.element).last()
        self.assertNotIn('<img', comment.author_name)

    def test_neither_element_nor_scene_creates_general_comment(self):
        """No element_id/scene_id creates a general comment on the shared link."""
        resp = self.client.post(self._comment_url(), {
            'text': 'General feedback',
            'author_name': 'Guest',
            'session_id': 'abc',
        })
        self.assertEqual(resp.status_code, 201)
        comment = Comment.objects.get(id=resp.data['id'])
        self.assertIsNotNone(comment.shared_link_id)
        self.assertIsNone(comment.element_id)
        self.assertIsNone(comment.scene_id)

    def test_both_element_and_scene_returns_400(self):
        resp = self.client.post(self._comment_url(), {
            'text': 'Both targets',
            'author_name': 'Guest',
            'session_id': 'abc',
            'element_id': self.element.id,
            'scene_id': self.scene.id,
        })
        self.assertEqual(resp.status_code, 400)

    def test_nonexistent_parent_returns_400(self):
        resp = self.client.post(self._comment_url(), {
            'text': 'Reply',
            'author_name': 'Guest',
            'session_id': 'abc',
            'element_id': self.element.id,
            'parent_id': 999999,
        })
        self.assertEqual(resp.status_code, 400)


# ─────────────────────────────────────────────────────────────────────
# 6. Reaction toggle
# ─────────────────────────────────────────────────────────────────────
@override_settings(REST_FRAMEWORK={'DEFAULT_THROTTLE_RATES': {'anon': '1000/min', 'user': '1000/min'}})
class ReactionToggleTest(SharingViewTestBase):

    def _url(self):
        return f'/api/sharing/public/{self.link.token}/reactions/'

    def _post(self, value, session_id='guest1'):
        return self.client.post(self._url(), {
            'element_id': self.element.id,
            'session_id': session_id,
            'value': value,
            'author_name': 'Guest',
        })

    def _post_remove(self, session_id='guest1'):
        """Send value=None to remove reaction."""
        return self.client.post(self._url(), {
            'element_id': self.element.id,
            'session_id': session_id,
            'value': '',
            'author_name': 'Guest',
        })

    def test_like_creates_reaction(self):
        resp = self._post('like')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['value'], 'like')
        self.assertEqual(resp.data['likes'], 1)
        self.assertEqual(resp.data['dislikes'], 0)

    def test_remove_reaction_with_null_value(self):
        self._post('like')
        resp = self._post_remove()
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data['value'])
        self.assertEqual(resp.data['likes'], 0)
        self.assertEqual(
            ElementReaction.objects.filter(
                element=self.element, session_id='guest1'
            ).count(),
            0
        )

    def test_like_then_dislike_updates(self):
        self._post('like')
        resp = self._post('dislike')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['value'], 'dislike')
        self.assertEqual(resp.data['likes'], 0)
        self.assertEqual(resp.data['dislikes'], 1)
        # Only one record in DB
        self.assertEqual(
            ElementReaction.objects.filter(
                element=self.element, session_id='guest1'
            ).count(),
            1
        )

    def test_invalid_value_returns_400(self):
        resp = self.client.post(self._url(), {
            'element_id': self.element.id,
            'session_id': 'guest1',
            'value': 'love',
        })
        self.assertEqual(resp.status_code, 400)

    def test_missing_session_id_returns_400(self):
        resp = self.client.post(self._url(), {
            'element_id': self.element.id,
            'value': 'like',
        })
        self.assertEqual(resp.status_code, 400)

    def test_element_not_in_link_returns_400(self):
        other = Element.objects.create(
            project=self.project, element_type='IMAGE',
            status='COMPLETED', source_type='GENERATED',
        )
        resp = self.client.post(self._url(), {
            'element_id': other.id,
            'session_id': 'guest1',
            'value': 'like',
        })
        self.assertEqual(resp.status_code, 400)

    def test_counts_are_accurate_with_multiple_sessions(self):
        self._post('like', session_id='a')
        self._post('like', session_id='b')
        resp = self._post('dislike', session_id='c')
        self.assertEqual(resp.data['likes'], 2)
        self.assertEqual(resp.data['dislikes'], 1)


# ─────────────────────────────────────────────────────────────────────
# 7. Review toggle
# ─────────────────────────────────────────────────────────────────────
@override_settings(REST_FRAMEWORK={'DEFAULT_THROTTLE_RATES': {'anon': '1000/min', 'user': '1000/min'}})
class ReviewToggleTest(SharingViewTestBase):

    def _url(self):
        return f'/api/sharing/public/{self.link.token}/review/'

    def _post(self, action, session_id='reviewer1'):
        return self.client.post(self._url(), {
            'element_id': self.element.id,
            'session_id': session_id,
            'action': action,
            'author_name': 'Reviewer',
        })

    def test_approve_creates_review(self):
        resp = self._post('approved')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['action'], 'approved')

    def test_same_action_toggles_off(self):
        """Sending the same action twice removes the review (toggle off)."""
        self._post('approved')
        resp = self._post('approved')
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data['action'])
        self.assertEqual(
            ElementReview.objects.filter(
                element=self.element, session_id='reviewer1'
            ).count(),
            0
        )

    def test_approve_then_reject_updates(self):
        self._post('approved')
        resp = self._post('rejected')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['action'], 'rejected')
        self.assertEqual(
            ElementReview.objects.filter(
                element=self.element, session_id='reviewer1'
            ).count(),
            1
        )

    def test_invalid_action_returns_400(self):
        resp = self._post('maybe')
        self.assertEqual(resp.status_code, 400)

    def test_missing_action_returns_400(self):
        resp = self.client.post(self._url(), {
            'element_id': self.element.id,
            'session_id': 'reviewer1',
        })
        self.assertEqual(resp.status_code, 400)

    def test_element_not_in_link_returns_400(self):
        other = Element.objects.create(
            project=self.project, element_type='IMAGE',
            status='COMPLETED', source_type='GENERATED',
        )
        resp = self.client.post(self._url(), {
            'element_id': other.id,
            'session_id': 'reviewer1',
            'action': 'approved',
        })
        self.assertEqual(resp.status_code, 400)


# ─────────────────────────────────────────────────────────────────────
# 8. Rate limiting — throttle classes are configured
# ─────────────────────────────────────────────────────────────────────
class ThrottleConfigTest(TestCase):

    def test_public_comment_throttle_rate(self):
        from apps.sharing.views import PublicCommentThrottle
        self.assertEqual(PublicCommentThrottle.rate, '60/min')

    def test_public_read_throttle_rate(self):
        from apps.sharing.views import PublicReadThrottle
        self.assertEqual(PublicReadThrottle.rate, '120/min')

    def test_auth_comment_throttle_rate(self):
        from apps.sharing.views import AuthCommentThrottle
        self.assertEqual(AuthCommentThrottle.rate, '30/min')


# ─────────────────────────────────────────────────────────────────────
# 9. Notification creation
# ─────────────────────────────────────────────────────────────────────
@override_settings(REST_FRAMEWORK={'DEFAULT_THROTTLE_RATES': {'anon': '1000/min', 'user': '1000/min'}})
class NotificationCreationTest(SharingViewTestBase):

    def test_comment_creates_notification_for_owner(self):
        resp = self.client.post(
            f'/api/sharing/public/{self.link.token}/comments/',
            {
                'text': 'Great work!',
                'author_name': 'Client',
                'session_id': 'guest1',
                'element_id': self.element.id,
            },
        )
        self.assertEqual(resp.status_code, 201)
        notif = Notification.objects.filter(
            user=self.owner, type='comment_new'
        )
        self.assertEqual(notif.count(), 1)
        self.assertIn('Client', notif.first().title)

    def test_first_reaction_creates_notification(self):
        self.client.post(
            f'/api/sharing/public/{self.link.token}/reactions/',
            {
                'element_id': self.element.id,
                'session_id': 'guest1',
                'value': 'like',
                'author_name': 'Fan',
            },
        )
        notif = Notification.objects.filter(
            user=self.owner, type='reaction_new'
        )
        self.assertEqual(notif.count(), 1)

    def test_reaction_update_does_not_create_extra_notification(self):
        """Changing an existing reaction should NOT create a second notification."""
        url = f'/api/sharing/public/{self.link.token}/reactions/'
        self.client.post(url, {
            'element_id': self.element.id,
            'session_id': 'guest1',
            'value': 'like',
            'author_name': 'Fan',
        })
        # Change to dislike
        self.client.post(url, {
            'element_id': self.element.id,
            'session_id': 'guest1',
            'value': 'dislike',
            'author_name': 'Fan',
        })
        notif_count = Notification.objects.filter(
            user=self.owner, type='reaction_new'
        ).count()
        self.assertEqual(notif_count, 1)

    def test_review_creates_notification(self):
        self.client.post(
            f'/api/sharing/public/{self.link.token}/review/',
            {
                'element_id': self.element.id,
                'session_id': 'reviewer1',
                'action': 'approved',
                'author_name': 'Director',
            },
        )
        notif = Notification.objects.filter(
            user=self.owner, type='review_new'
        )
        self.assertEqual(notif.count(), 1)
        self.assertIn('Director', notif.first().title)


# ─────────────────────────────────────────────────────────────────────
# 10. Auth comment views (workspace owner)
# ─────────────────────────────────────────────────────────────────────
@override_settings(REST_FRAMEWORK={'DEFAULT_THROTTLE_RATES': {'anon': '1000/min', 'user': '1000/min'}})
class AuthCommentViewTest(SharingViewTestBase):

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.owner)

    def test_get_element_comments(self):
        Comment.objects.create(
            element=self.element, author_name='Guest',
            session_id='s1', text='Nice',
        )
        Comment.objects.create(
            element=self.element, author_name='System',
            session_id='sys', text='Auto', is_system=True,
        )
        resp = self.client.get(f'/api/sharing/elements/{self.element.id}/comments/')
        self.assertEqual(resp.status_code, 200)
        # System comments excluded
        self.assertEqual(len(resp.data), 1)

    def test_post_element_comment(self):
        resp = self.client.post(
            f'/api/sharing/elements/{self.element.id}/comments/',
            {'text': 'Owner reply'},
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['author_name'], 'owner')

    def test_mark_comment_read(self):
        comment = Comment.objects.create(
            element=self.element, author_name='Guest',
            session_id='s1', text='Hi',
        )
        resp = self.client.patch(f'/api/sharing/comments/{comment.id}/read/')
        self.assertEqual(resp.status_code, 200)
        comment.refresh_from_db()
        self.assertTrue(comment.is_read)

    def test_mark_all_comments_read(self):
        Comment.objects.create(
            element=self.element, author_name='A', session_id='s1', text='1'
        )
        Comment.objects.create(
            element=self.element, author_name='B', session_id='s2', text='2'
        )
        resp = self.client.post(
            '/api/sharing/comments/read-all/',
            {'project_id': self.project.id},
        )
        self.assertEqual(resp.status_code, 200)
        unread = Comment.objects.filter(element=self.element, is_read=False).count()
        self.assertEqual(unread, 0)


# ─────────────────────────────────────────────────────────────────────
# 11. Ungrouped elements (no scene)
# ─────────────────────────────────────────────────────────────────────
@override_settings(REST_FRAMEWORK={'DEFAULT_THROTTLE_RATES': {'anon': '1000/min', 'user': '1000/min'}})
class UngroupedElementTest(SharingViewTestBase):

    def test_ungrouped_element_in_response(self):
        ungrouped = Element.objects.create(
            project=self.project, scene=None,
            element_type='IMAGE', status='COMPLETED',
            source_type='UPLOADED',
        )
        self.link.elements.add(ungrouped)

        resp = self.client.get(f'/api/sharing/public/{self.link.token}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['ungrouped_elements']), 1)
        self.assertEqual(resp.data['ungrouped_elements'][0]['id'], ungrouped.id)
