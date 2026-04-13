"""Tests for sharing models: SharedLink, Comment, ElementReaction, ElementReview."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from apps.elements.models import Element
from apps.projects.models import Project
from apps.scenes.models import Scene
from apps.sharing.models import Comment, ElementReaction, ElementReview, SharedLink

User = get_user_model()


class SharedLinkModelTest(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username='owner', email='owner@example.com', password='pass123'
        )
        self.project = Project.objects.create(user=self.user, name='Test Project')

    def test_create_shared_link(self):
        link = SharedLink.objects.create(
            project=self.project, created_by=self.user
        )
        self.assertIsNotNone(link.token)
        self.assertIsNone(link.expires_at)

    def test_is_expired_false_when_no_expiry(self):
        link = SharedLink.objects.create(
            project=self.project, created_by=self.user
        )
        self.assertFalse(link.is_expired())

    def test_is_expired_true_when_past(self):
        link = SharedLink.objects.create(
            project=self.project, created_by=self.user,
            expires_at=timezone.now() - timedelta(days=1),
        )
        self.assertTrue(link.is_expired())

    def test_is_expired_false_when_future(self):
        link = SharedLink.objects.create(
            project=self.project, created_by=self.user,
            expires_at=timezone.now() + timedelta(days=7),
        )
        self.assertFalse(link.is_expired())

    def test_str_contains_project_name(self):
        link = SharedLink.objects.create(
            project=self.project, created_by=self.user
        )
        self.assertIn(self.project.name, str(link))
        self.assertIn('бессрочная', str(link))


class CommentModelTest(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username='owner', email='owner@example.com', password='pass123'
        )
        self.project = Project.objects.create(user=self.user, name='Test Project')
        self.scene = Scene.objects.create(
            project=self.project, name='Scene 1', order_index=0
        )
        self.element = Element.objects.create(
            project=self.project, scene=self.scene,
            element_type='IMAGE', status='COMPLETED',
            source_type='GENERATED',
        )

    def test_create_scene_comment(self):
        c = Comment.objects.create(
            scene=self.scene, author_name='Guest', text='Nice'
        )
        self.assertEqual(c.author_name, 'Guest')
        self.assertFalse(c.is_read)
        self.assertFalse(c.is_system)

    def test_create_element_comment(self):
        c = Comment.objects.create(
            element=self.element, author_name='Guest', text='Cool'
        )
        self.assertEqual(c.element_id, self.element.id)

    def test_system_comment_flag(self):
        c = Comment.objects.create(
            element=self.element, author_name='System',
            text='Review started', is_system=True,
        )
        self.assertTrue(c.is_system)

    def test_reply_must_match_target(self):
        """Reply parent must be on the same element/scene."""
        other_element = Element.objects.create(
            project=self.project, scene=self.scene,
            element_type='IMAGE', status='COMPLETED',
            source_type='GENERATED',
        )
        parent = Comment.objects.create(
            element=self.element, author_name='A', text='Parent'
        )
        reply = Comment(
            element=other_element, author_name='B', text='Reply',
            parent=parent,
        )
        with self.assertRaises(ValidationError):
            reply.clean()


class ElementReactionModelTest(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username='owner', email='owner@example.com', password='pass123'
        )
        self.project = Project.objects.create(user=self.user, name='Test Project')
        self.element = Element.objects.create(
            project=self.project, element_type='IMAGE',
            status='COMPLETED', source_type='GENERATED',
        )

    def test_unique_together(self):
        ElementReaction.objects.create(
            element=self.element, session_id='s1', value='like'
        )
        with self.assertRaises(Exception):
            ElementReaction.objects.create(
                element=self.element, session_id='s1', value='dislike'
            )

    def test_different_sessions_allowed(self):
        ElementReaction.objects.create(
            element=self.element, session_id='s1', value='like'
        )
        ElementReaction.objects.create(
            element=self.element, session_id='s2', value='dislike'
        )
        self.assertEqual(ElementReaction.objects.filter(element=self.element).count(), 2)


class ElementReviewModelTest(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username='owner', email='owner@example.com', password='pass123'
        )
        self.project = Project.objects.create(user=self.user, name='Test Project')
        self.element = Element.objects.create(
            project=self.project, element_type='IMAGE',
            status='COMPLETED', source_type='GENERATED',
        )

    def test_unique_together(self):
        ElementReview.objects.create(
            element=self.element, session_id='s1', action='approved'
        )
        with self.assertRaises(Exception):
            ElementReview.objects.create(
                element=self.element, session_id='s1', action='rejected'
            )

    def test_different_sessions_allowed(self):
        ElementReview.objects.create(
            element=self.element, session_id='s1', action='approved'
        )
        ElementReview.objects.create(
            element=self.element, session_id='s2', action='rejected'
        )
        self.assertEqual(ElementReview.objects.filter(element=self.element).count(), 2)
