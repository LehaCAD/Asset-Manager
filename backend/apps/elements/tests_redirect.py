"""Tests for the public element redirect view (/elements/<id>/[variant]/).

This endpoint hides raw S3 URLs behind a short, branded redirect:
  GET /elements/123/           -> 302 -> element.file_url      (original)
  GET /elements/123/thumb/     -> 302 -> element.thumbnail_url (256px)
  GET /elements/123/preview/   -> 302 -> element.preview_url   (800px)

The view is anonymous — element IDs are already publicly exposed via share links
and the same permission model as /api/sharing/public/<token>/ elements.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.elements.models import Element
from apps.projects.models import Project
from apps.scenes.models import Scene

User = get_user_model()


class ElementRedirectBaseMixin:
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username='redirect-user',
            email='redirect@example.com',
            password='pw',
        )
        cls.project = Project.objects.create(user=cls.user, name='Proj')
        cls.scene = Scene.objects.create(project=cls.project, name='Scene')
        cls.element = Element.objects.create(
            project=cls.project,
            scene=cls.scene,
            element_type='IMAGE',
            file_url='https://bucket.example.com/media/original.jpg',
            thumbnail_url='https://bucket.example.com/media/thumb.jpg',
            preview_url='https://bucket.example.com/media/preview.jpg',
        )


class ElementRedirectFileTest(ElementRedirectBaseMixin, TestCase):
    """Default variant (no suffix) redirects to original file_url."""

    def test_get_redirects_to_file_url(self):
        response = self.client.get(f'/elements/{self.element.id}/')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response['Location'], self.element.file_url)

    def test_explicit_file_variant(self):
        response = self.client.get(f'/elements/{self.element.id}/file/')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response['Location'], self.element.file_url)

    def test_missing_element_returns_404(self):
        response = self.client.get('/elements/99999/')
        self.assertEqual(response.status_code, 404)

    def test_post_not_allowed(self):
        response = self.client.post(f'/elements/{self.element.id}/')
        self.assertEqual(response.status_code, 405)

    def test_empty_file_url_returns_410(self):
        element = Element.objects.create(
            project=self.project,
            scene=self.scene,
            element_type='IMAGE',
            file_url='',
        )
        response = self.client.get(f'/elements/{element.id}/')
        self.assertEqual(response.status_code, 410)

    def test_head_request_also_redirects(self):
        """HEAD should behave like GET (common for crawlers / previews)."""
        response = self.client.head(f'/elements/{self.element.id}/')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response['Location'], self.element.file_url)


class ElementRedirectThumbTest(ElementRedirectBaseMixin, TestCase):
    def test_thumb_variant_redirects_to_thumbnail_url(self):
        response = self.client.get(f'/elements/{self.element.id}/thumb/')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response['Location'], self.element.thumbnail_url)

    def test_empty_thumbnail_returns_410(self):
        element = Element.objects.create(
            project=self.project,
            scene=self.scene,
            element_type='IMAGE',
            file_url='https://bucket.example.com/x.jpg',
            thumbnail_url='',
        )
        response = self.client.get(f'/elements/{element.id}/thumb/')
        self.assertEqual(response.status_code, 410)

    def test_unknown_variant_returns_404(self):
        response = self.client.get(f'/elements/{self.element.id}/garbage/')
        self.assertEqual(response.status_code, 404)


class ElementRedirectPreviewTest(ElementRedirectBaseMixin, TestCase):
    def test_preview_variant_redirects_to_preview_url(self):
        response = self.client.get(f'/elements/{self.element.id}/preview/')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response['Location'], self.element.preview_url)

    def test_empty_preview_returns_410(self):
        element = Element.objects.create(
            project=self.project,
            scene=self.scene,
            element_type='VIDEO',
            file_url='https://bucket.example.com/v.mp4',
            thumbnail_url='https://bucket.example.com/t.jpg',
            preview_url='',
        )
        response = self.client.get(f'/elements/{element.id}/preview/')
        self.assertEqual(response.status_code, 410)


class ElementRedirectHelperTest(ElementRedirectBaseMixin, TestCase):
    """Tests for the `build_element_url` helper used by serializers."""

    def test_builds_absolute_url_with_request(self):
        from apps.elements.url_helpers import build_element_url
        from django.test import RequestFactory

        rf = RequestFactory()
        request = rf.get('/api/elements/')
        url = build_element_url(self.element, 'file', request)
        self.assertTrue(url.startswith('http://'))
        self.assertIn(f'/elements/{self.element.id}/', url)

    def test_thumb_variant_includes_suffix(self):
        from apps.elements.url_helpers import build_element_url
        from django.test import RequestFactory

        request = RequestFactory().get('/')
        url = build_element_url(self.element, 'thumb', request)
        self.assertTrue(url.endswith(f'/elements/{self.element.id}/thumb/'))

    def test_preview_variant_includes_suffix(self):
        from apps.elements.url_helpers import build_element_url
        from django.test import RequestFactory

        request = RequestFactory().get('/')
        url = build_element_url(self.element, 'preview', request)
        self.assertTrue(url.endswith(f'/elements/{self.element.id}/preview/'))

    def test_empty_source_returns_empty_string(self):
        """When the underlying S3 field is empty, helper returns '' (frontend treats '' as no-image)."""
        from apps.elements.url_helpers import build_element_url
        from django.test import RequestFactory

        element = Element.objects.create(
            project=self.project,
            scene=self.scene,
            element_type='IMAGE',
            file_url='',
        )
        request = RequestFactory().get('/')
        self.assertEqual(build_element_url(element, 'file', request), '')

    def test_best_preview_picks_preview_then_thumb_then_file(self):
        from apps.elements.url_helpers import build_best_preview_url
        from django.test import RequestFactory

        request = RequestFactory().get('/')

        # all three populated → preview
        url = build_best_preview_url(self.element, request)
        self.assertIn(f'/elements/{self.element.id}/preview/', url)

        # no preview → thumb
        self.element.preview_url = ''
        self.element.save(update_fields=['preview_url'])
        url = build_best_preview_url(self.element, request)
        self.assertIn(f'/elements/{self.element.id}/thumb/', url)

        # only file
        self.element.thumbnail_url = ''
        self.element.save(update_fields=['thumbnail_url'])
        url = build_best_preview_url(self.element, request)
        self.assertTrue(url.endswith(f'/elements/{self.element.id}/'))

        # nothing
        self.element.file_url = ''
        self.element.save(update_fields=['file_url'])
        self.assertEqual(build_best_preview_url(self.element, request), '')
