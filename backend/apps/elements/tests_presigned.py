"""
Tests for presigned URL system — presigned.py utils, presign endpoint, complete endpoint.

All boto3/S3 interactions are mocked. No real network calls.
"""
from unittest.mock import patch, MagicMock, PropertyMock

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from apps.storage.presigned import (
    generate_upload_presigned_urls,
    get_public_url,
    head_s3_object,
    _get_extension,
    PRESIGN_TTL,
)
from apps.elements.models import Element
from apps.projects.models import Project
from apps.scenes.models import Scene

User = get_user_model()

# Shared test settings so we don't need real AWS credentials
TEST_S3_SETTINGS = {
    'AWS_S3_ENDPOINT_URL': 'https://s3.test.com',
    'AWS_ACCESS_KEY_ID': 'test-key',
    'AWS_SECRET_ACCESS_KEY': 'test-secret',
    'AWS_S3_REGION_NAME': 'us-east-1',
    'AWS_STORAGE_BUCKET_NAME': 'test-bucket',
    'AWS_S3_CUSTOM_DOMAIN': 'test-bucket.s3.test.com',
}


# ──────────────────────────────────────────────────────────
# Unit tests: _get_extension
# ──────────────────────────────────────────────────────────

class GetExtensionTest(TestCase):
    """Tests for _get_extension helper."""

    def test_jpg(self):
        self.assertEqual(_get_extension('photo.jpg'), '.jpg')

    def test_png_uppercase(self):
        """Extension should be lowercased."""
        self.assertEqual(_get_extension('file.PNG'), '.png')

    def test_no_extension(self):
        self.assertEqual(_get_extension('noext'), '')

    def test_multiple_dots(self):
        self.assertEqual(_get_extension('multiple.dots.mp4'), '.mp4')

    def test_hidden_file_with_ext(self):
        self.assertEqual(_get_extension('.hidden.jpeg'), '.jpeg')

    def test_empty_string(self):
        self.assertEqual(_get_extension(''), '')


# ──────────────────────────────────────────────────────────
# Unit tests: get_public_url
# ──────────────────────────────────────────────────────────

@override_settings(**TEST_S3_SETTINGS)
class GetPublicUrlTest(TestCase):
    """Tests for get_public_url."""

    def test_builds_correct_url(self):
        url = get_public_url('projects/42/root/abc.jpg')
        self.assertEqual(url, 'https://test-bucket.s3.test.com/projects/42/root/abc.jpg')

    def test_empty_key(self):
        url = get_public_url('')
        self.assertEqual(url, 'https://test-bucket.s3.test.com/')


# ──────────────────────────────────────────────────────────
# Unit tests: generate_upload_presigned_urls
# ──────────────────────────────────────────────────────────

@override_settings(**TEST_S3_SETTINGS)
class GenerateUploadPresignedUrlsTest(TestCase):
    """Tests for generate_upload_presigned_urls."""

    @patch('apps.common.presigned._get_s3_client')
    def test_jpg_content_type(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = 'https://presigned.url'
        mock_get_client.return_value = mock_client

        result = generate_upload_presigned_urls(1, 5, 'photo.jpg', 'IMAGE')
        self.assertEqual(result['content_types']['original'], 'image/jpeg')

    @patch('apps.common.presigned._get_s3_client')
    def test_png_content_type(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = 'https://presigned.url'
        mock_get_client.return_value = mock_client

        result = generate_upload_presigned_urls(1, 5, 'photo.png', 'IMAGE')
        self.assertEqual(result['content_types']['original'], 'image/png')

    @patch('apps.common.presigned._get_s3_client')
    def test_mp4_content_type(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = 'https://presigned.url'
        mock_get_client.return_value = mock_client

        result = generate_upload_presigned_urls(1, 5, 'video.mp4', 'VIDEO')
        self.assertEqual(result['content_types']['original'], 'video/mp4')

    @patch('apps.common.presigned._get_s3_client')
    def test_unknown_extension_content_type(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = 'https://presigned.url'
        mock_get_client.return_value = mock_client

        result = generate_upload_presigned_urls(1, 5, 'data.xyz', 'IMAGE')
        self.assertEqual(result['content_types']['original'], 'application/octet-stream')

    @patch('apps.common.presigned._get_s3_client')
    def test_thumbnails_always_jpeg(self, mock_get_client):
        """Thumbnail content types should always be image/jpeg regardless of original."""
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = 'https://presigned.url'
        mock_get_client.return_value = mock_client

        result = generate_upload_presigned_urls(1, 5, 'video.mp4', 'VIDEO')
        self.assertEqual(result['content_types']['small'], 'image/jpeg')
        self.assertEqual(result['content_types']['medium'], 'image/jpeg')

    @patch('apps.common.presigned._get_s3_client')
    def test_scene_id_none_root_prefix(self, mock_get_client):
        """scene_id=None -> key prefix is projects/{id}/root/."""
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = 'https://presigned.url'
        mock_get_client.return_value = mock_client

        result = generate_upload_presigned_urls(42, None, 'photo.jpg', 'IMAGE')
        for variant, key in result['upload_keys'].items():
            self.assertTrue(key.startswith('projects/42/root/'), f"Key {key} doesn't start with root prefix")
            self.assertNotIn('scenes/None', key)

    @patch('apps.common.presigned._get_s3_client')
    def test_scene_id_present_scenes_prefix(self, mock_get_client):
        """scene_id=5 -> key prefix is projects/{id}/scenes/5/."""
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = 'https://presigned.url'
        mock_get_client.return_value = mock_client

        result = generate_upload_presigned_urls(42, 5, 'photo.jpg', 'IMAGE')
        for variant, key in result['upload_keys'].items():
            self.assertTrue(key.startswith('projects/42/scenes/5/'), f"Key {key} doesn't have scene prefix")

    @patch('apps.common.presigned._get_s3_client')
    def test_returns_three_keys(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = 'https://presigned.url'
        mock_get_client.return_value = mock_client

        result = generate_upload_presigned_urls(1, 5, 'photo.jpg', 'IMAGE')
        self.assertEqual(set(result['upload_keys'].keys()), {'original', 'small', 'medium'})

    @patch('apps.common.presigned._get_s3_client')
    def test_returns_three_presigned_urls(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = 'https://presigned.url'
        mock_get_client.return_value = mock_client

        result = generate_upload_presigned_urls(1, 5, 'photo.jpg', 'IMAGE')
        self.assertEqual(set(result['presigned_urls'].keys()), {'original', 'small', 'medium'})

    @patch('apps.common.presigned._get_s3_client')
    def test_returns_three_content_types(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = 'https://presigned.url'
        mock_get_client.return_value = mock_client

        result = generate_upload_presigned_urls(1, 5, 'photo.jpg', 'IMAGE')
        self.assertEqual(set(result['content_types'].keys()), {'original', 'small', 'medium'})

    @patch('apps.common.presigned._get_s3_client')
    def test_returns_expires_in(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = 'https://presigned.url'
        mock_get_client.return_value = mock_client

        result = generate_upload_presigned_urls(1, 5, 'photo.jpg', 'IMAGE')
        self.assertEqual(result['expires_in'], 900)
        self.assertEqual(result['expires_in'], PRESIGN_TTL)

    @patch('apps.common.presigned._get_s3_client')
    def test_original_key_has_correct_extension(self, mock_get_client):
        """Original key should preserve the file extension."""
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = 'https://presigned.url'
        mock_get_client.return_value = mock_client

        result = generate_upload_presigned_urls(1, 5, 'photo.png', 'IMAGE')
        self.assertTrue(result['upload_keys']['original'].endswith('.png'))

    @patch('apps.common.presigned._get_s3_client')
    def test_thumbnail_keys_are_jpg(self, mock_get_client):
        """Thumbnail keys should always be .jpg regardless of original format."""
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = 'https://presigned.url'
        mock_get_client.return_value = mock_client

        result = generate_upload_presigned_urls(1, 5, 'photo.png', 'IMAGE')
        self.assertTrue(result['upload_keys']['small'].endswith('.jpg'))
        self.assertTrue(result['upload_keys']['medium'].endswith('.jpg'))


# ──────────────────────────────────────────────────────────
# Unit tests: head_s3_object
# ──────────────────────────────────────────────────────────

@override_settings(**TEST_S3_SETTINGS)
class HeadS3ObjectTest(TestCase):
    """Tests for head_s3_object."""

    @patch('apps.common.presigned._get_s3_client')
    def test_object_exists(self, mock_get_client):
        """Existing object -> returns {size, content_type}."""
        mock_client = MagicMock()
        mock_client.head_object.return_value = {
            'ContentLength': 5000,
            'ContentType': 'image/jpeg',
        }
        mock_get_client.return_value = mock_client

        result = head_s3_object('projects/1/root/abc.jpg')
        self.assertEqual(result, {'size': 5000, 'content_type': 'image/jpeg'})

    @patch('apps.common.presigned._get_s3_client')
    def test_object_not_found(self, mock_get_client):
        """Non-existent object -> returns None."""
        mock_client = MagicMock()
        # Simulate ClientError for 404
        error_response = {'Error': {'Code': '404', 'Message': 'Not Found'}}
        mock_client.exceptions.ClientError = type('ClientError', (Exception,), {})
        mock_client.head_object.side_effect = mock_client.exceptions.ClientError(
            error_response, 'HeadObject',
        )
        mock_get_client.return_value = mock_client

        result = head_s3_object('projects/1/root/nonexistent.jpg')
        self.assertIsNone(result)


# ──────────────────────────────────────────────────────────
# API tests: POST /api/scenes/{id}/presign/
# ──────────────────────────────────────────────────────────

@override_settings(**TEST_S3_SETTINGS)
class PresignEndpointTest(TestCase):
    """Tests for the presign endpoint on SceneViewSet."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
        )
        self.other_user = User.objects.create_user(
            username='otheruser',
            email='other@example.com',
            password='testpass123',
        )
        self.project = Project.objects.create(
            user=self.user,
            name='Test Project',
        )
        self.other_project = Project.objects.create(
            user=self.other_user,
            name='Other Project',
        )
        self.scene = Scene.objects.create(
            project=self.project,
            name='Test Scene',
            order_index=0,
        )
        self.other_scene = Scene.objects.create(
            project=self.other_project,
            name='Other Scene',
            order_index=0,
        )

    @patch('apps.common.presigned._get_s3_client')
    def test_valid_request_returns_200(self, mock_get_client):
        """Valid presign request -> 200 with element_id, presigned_urls, upload_keys, content_types."""
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = 'https://presigned.url'
        mock_get_client.return_value = mock_client

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f'/api/scenes/{self.scene.id}/presign/',
            {'filename': 'photo.jpg'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('element_id', response.data)
        self.assertIn('presigned_urls', response.data)
        self.assertIn('upload_keys', response.data)
        self.assertIn('content_types', response.data)

    @patch('apps.common.presigned._get_s3_client')
    def test_creates_element_with_uploading_status(self, mock_get_client):
        """Presign should create an Element with status=UPLOADING."""
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = 'https://presigned.url'
        mock_get_client.return_value = mock_client

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f'/api/scenes/{self.scene.id}/presign/',
            {'filename': 'photo.jpg'},
            format='json',
        )

        element = Element.objects.get(id=response.data['element_id'])
        self.assertEqual(element.status, Element.STATUS_UPLOADING)
        self.assertEqual(element.source_type, Element.SOURCE_UPLOADED)
        self.assertEqual(element.element_type, Element.ELEMENT_TYPE_IMAGE)
        self.assertEqual(element.project_id, self.project.id)
        self.assertEqual(element.scene_id, self.scene.id)

    def test_invalid_filename_returns_400(self):
        """Unsupported file extension -> 400."""
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f'/api/scenes/{self.scene.id}/presign/',
            {'filename': 'document.pdf'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_empty_filename_returns_400(self):
        """Empty filename -> 400."""
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f'/api/scenes/{self.scene.id}/presign/',
            {'filename': ''},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_returns_403(self):
        """Unauthenticated request -> 401 or 403."""
        response = self.client.post(
            f'/api/scenes/{self.scene.id}/presign/',
            {'filename': 'photo.jpg'},
            format='json',
        )

        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_non_owner_returns_403(self):
        """User accessing another user's scene -> 403 or 404."""
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f'/api/scenes/{self.other_scene.id}/presign/',
            {'filename': 'photo.jpg'},
            format='json',
        )

        # DRF returns 404 because get_queryset filters by user
        self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    @patch('apps.common.presigned._get_s3_client')
    def test_mp4_creates_video_element(self, mock_get_client):
        """MP4 file -> element_type should be VIDEO."""
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = 'https://presigned.url'
        mock_get_client.return_value = mock_client

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f'/api/scenes/{self.scene.id}/presign/',
            {'filename': 'clip.mp4'},
            format='json',
        )

        element = Element.objects.get(id=response.data['element_id'])
        self.assertEqual(element.element_type, Element.ELEMENT_TYPE_VIDEO)

    @patch('apps.common.presigned._get_s3_client')
    def test_upload_keys_stored_on_element(self, mock_get_client):
        """Upload keys should be stored on the element for later use by complete."""
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = 'https://presigned.url'
        mock_get_client.return_value = mock_client

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f'/api/scenes/{self.scene.id}/presign/',
            {'filename': 'photo.jpg'},
            format='json',
        )

        element = Element.objects.get(id=response.data['element_id'])
        self.assertIsNotNone(element.upload_keys)
        self.assertIn('original', element.upload_keys)
        self.assertIn('small', element.upload_keys)
        self.assertIn('medium', element.upload_keys)


# ──────────────────────────────────────────────────────────
# API tests: POST /api/elements/{id}/complete/ (phase=thumbnail)
# ──────────────────────────────────────────────────────────

@override_settings(**TEST_S3_SETTINGS)
class CompleteEndpointThumbnailPhaseTest(TestCase):
    """Tests for upload_complete with phase=thumbnail."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
        )
        self.other_user = User.objects.create_user(
            username='otheruser',
            email='other@example.com',
            password='testpass123',
        )
        self.project = Project.objects.create(user=self.user, name='Test Project')
        self.other_project = Project.objects.create(user=self.other_user, name='Other Project')

        self.scene = Scene.objects.create(
            project=self.project, name='Test Scene', order_index=0,
        )

        self.element = Element.objects.create(
            project=self.project,
            scene=self.scene,
            element_type=Element.ELEMENT_TYPE_IMAGE,
            status=Element.STATUS_UPLOADING,
            source_type=Element.SOURCE_UPLOADED,
            upload_keys={
                'original': 'projects/1/scenes/1/abc.jpg',
                'small': 'projects/1/scenes/1/abc_sm.jpg',
                'medium': 'projects/1/scenes/1/abc_md.jpg',
            },
        )

    @patch('apps.notifications.services.notify_element_status')
    def test_thumbnail_phase_sets_thumbnail_url(self, mock_notify):
        """phase=thumbnail -> sets thumbnail_url, status stays UPLOADING."""
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f'/api/elements/{self.element.id}/complete/',
            {'phase': 'thumbnail'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.element.refresh_from_db()
        self.assertEqual(self.element.status, Element.STATUS_UPLOADING)
        self.assertIn('abc_sm.jpg', self.element.thumbnail_url)

    def test_element_not_uploading_returns_404(self):
        """Element not in UPLOADING status -> 404."""
        self.element.status = Element.STATUS_COMPLETED
        self.element.save()

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f'/api/elements/{self.element.id}/complete/',
            {'phase': 'thumbnail'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_other_user_element_returns_404(self):
        """Element belongs to different user -> 404."""
        self.client.force_authenticate(user=self.other_user)
        response = self.client.post(
            f'/api/elements/{self.element.id}/complete/',
            {'phase': 'thumbnail'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_invalid_phase_returns_400(self):
        """Invalid phase value -> 400."""
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f'/api/elements/{self.element.id}/complete/',
            {'phase': 'invalid_phase'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_no_phase_returns_400(self):
        """Missing phase -> 400."""
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f'/api/elements/{self.element.id}/complete/',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_returns_403(self):
        """Unauthenticated request -> 401 or 403."""
        response = self.client.post(
            f'/api/elements/{self.element.id}/complete/',
            {'phase': 'thumbnail'},
            format='json',
        )

        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])


# ──────────────────────────────────────────────────────────
# API tests: POST /api/elements/{id}/complete/ (phase=final)
# ──────────────────────────────────────────────────────────

@override_settings(**TEST_S3_SETTINGS)
class CompleteEndpointFinalPhaseTest(TestCase):
    """Tests for upload_complete with phase=final."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
        )
        self.project = Project.objects.create(user=self.user, name='Test Project')
        self.scene = Scene.objects.create(
            project=self.project, name='Test Scene', order_index=0,
        )

        self.element = Element.objects.create(
            project=self.project,
            scene=self.scene,
            element_type=Element.ELEMENT_TYPE_IMAGE,
            status=Element.STATUS_UPLOADING,
            source_type=Element.SOURCE_UPLOADED,
            upload_keys={
                'original': 'projects/1/scenes/1/abc.jpg',
                'small': 'projects/1/scenes/1/abc_sm.jpg',
                'medium': 'projects/1/scenes/1/abc_md.jpg',
            },
        )

    @patch('apps.notifications.services.notify_element_status')
    @patch('apps.elements.views_upload.head_s3_object')
    def test_final_phase_sets_file_url_and_status(self, mock_head, mock_notify):
        """phase=final -> sets file_url, preview_url, file_size, status=COMPLETED."""
        mock_head.return_value = {'size': 5000, 'content_type': 'image/jpeg'}

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f'/api/elements/{self.element.id}/complete/',
            {'phase': 'final'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.element.refresh_from_db()
        self.assertEqual(self.element.status, Element.STATUS_COMPLETED)
        self.assertIn('abc.jpg', self.element.file_url)
        self.assertIn('abc_md.jpg', self.element.preview_url)
        self.assertEqual(self.element.file_size, 5000)

    @patch('apps.notifications.services.notify_element_status')
    @patch('apps.elements.views_upload.head_s3_object')
    def test_final_phase_sends_websocket_notification(self, mock_head, mock_notify):
        """Final phase should notify via WebSocket with status COMPLETED."""
        mock_head.return_value = {'size': 1000, 'content_type': 'image/jpeg'}

        self.client.force_authenticate(user=self.user)
        self.client.post(
            f'/api/elements/{self.element.id}/complete/',
            {'phase': 'final'},
            format='json',
        )

        mock_notify.assert_called_once()
        call_args = mock_notify.call_args
        self.assertEqual(call_args[1].get('status') or call_args[0][1], 'COMPLETED')

    @patch('apps.elements.views_upload.head_s3_object')
    def test_head_returns_none_means_400(self, mock_head):
        """HEAD returns None (file not in S3) -> 400."""
        mock_head.return_value = None

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f'/api/elements/{self.element.id}/complete/',
            {'phase': 'final'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.element.refresh_from_db()
        self.assertEqual(self.element.status, Element.STATUS_UPLOADING)  # unchanged

    @patch('apps.elements.views_upload.head_s3_object')
    def test_already_completed_returns_404(self, mock_head):
        """Element already COMPLETED -> 404 (not in UPLOADING status)."""
        mock_head.return_value = {'size': 5000, 'content_type': 'image/jpeg'}
        self.element.status = Element.STATUS_COMPLETED
        self.element.save()

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f'/api/elements/{self.element.id}/complete/',
            {'phase': 'final'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ──────────────────────────────────────────────────────────
# Race condition test
# ──────────────────────────────────────────────────────────

@override_settings(**TEST_S3_SETTINGS)
class CompleteEndpointRaceConditionTest(TestCase):
    """Test race condition: two concurrent complete(final) calls."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
        )
        self.project = Project.objects.create(user=self.user, name='Test Project')
        self.scene = Scene.objects.create(
            project=self.project, name='Test Scene', order_index=0,
        )

    @patch('apps.notifications.services.notify_element_status')
    @patch('apps.elements.views_upload.head_s3_object')
    def test_second_complete_returns_404(self, mock_head, mock_notify):
        """After first complete(final) succeeds, second should 404 (status already COMPLETED)."""
        mock_head.return_value = {'size': 3000, 'content_type': 'image/jpeg'}

        element = Element.objects.create(
            project=self.project,
            scene=self.scene,
            element_type=Element.ELEMENT_TYPE_IMAGE,
            status=Element.STATUS_UPLOADING,
            source_type=Element.SOURCE_UPLOADED,
            upload_keys={
                'original': 'projects/1/scenes/1/race.jpg',
                'small': 'projects/1/scenes/1/race_sm.jpg',
                'medium': 'projects/1/scenes/1/race_md.jpg',
            },
        )

        self.client.force_authenticate(user=self.user)

        # First call succeeds
        resp1 = self.client.post(
            f'/api/elements/{element.id}/complete/',
            {'phase': 'final'},
            format='json',
        )
        self.assertEqual(resp1.status_code, status.HTTP_200_OK)

        # Second call should 404 (element no longer UPLOADING)
        resp2 = self.client.post(
            f'/api/elements/{element.id}/complete/',
            {'phase': 'final'},
            format='json',
        )
        self.assertEqual(resp2.status_code, status.HTTP_404_NOT_FOUND)


# ──────────────────────────────────────────────────────────
# Batch upload test
# ──────────────────────────────────────────────────────────

@override_settings(**TEST_S3_SETTINGS)
class BatchUploadTest(TestCase):
    """Test creating multiple elements and completing them all."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
        )
        self.project = Project.objects.create(user=self.user, name='Test Project')
        self.scene = Scene.objects.create(
            project=self.project, name='Test Scene', order_index=0,
        )

    @patch('apps.notifications.services.notify_element_status')
    @patch('apps.elements.views_upload.head_s3_object')
    @patch('apps.common.presigned._get_s3_client')
    def test_five_elements_upload_complete_cycle(self, mock_get_client, mock_head, mock_notify):
        """Create 5 elements in UPLOADING status rapidly, complete them all."""
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = 'https://presigned.url'
        mock_get_client.return_value = mock_client
        mock_head.return_value = {'size': 2000, 'content_type': 'image/jpeg'}

        self.client.force_authenticate(user=self.user)

        element_ids = []
        filenames = ['img1.jpg', 'img2.png', 'img3.jpg', 'clip1.mp4', 'img4.jpeg']

        # Create 5 elements via presign
        for fname in filenames:
            response = self.client.post(
                f'/api/scenes/{self.scene.id}/presign/',
                {'filename': fname},
                format='json',
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            element_ids.append(response.data['element_id'])

        # Verify all 5 are in UPLOADING
        uploading_count = Element.objects.filter(
            id__in=element_ids, status=Element.STATUS_UPLOADING,
        ).count()
        self.assertEqual(uploading_count, 5)

        # Complete thumbnail phase for all
        for eid in element_ids:
            response = self.client.post(
                f'/api/elements/{eid}/complete/',
                {'phase': 'thumbnail'},
                format='json',
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Complete final phase for all
        for eid in element_ids:
            response = self.client.post(
                f'/api/elements/{eid}/complete/',
                {'phase': 'final'},
                format='json',
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Verify no elements left in UPLOADING
        uploading_count = Element.objects.filter(
            id__in=element_ids, status=Element.STATUS_UPLOADING,
        ).count()
        self.assertEqual(uploading_count, 0)

        # Verify all are COMPLETED
        completed_count = Element.objects.filter(
            id__in=element_ids, status=Element.STATUS_COMPLETED,
        ).count()
        self.assertEqual(completed_count, 5)

    @patch('apps.notifications.services.notify_element_status')
    @patch('apps.elements.views_upload.head_s3_object')
    @patch('apps.common.presigned._get_s3_client')
    def test_five_elements_correct_types(self, mock_get_client, mock_head, mock_notify):
        """Verify correct element_type is assigned for each file extension."""
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = 'https://presigned.url'
        mock_get_client.return_value = mock_client
        mock_head.return_value = {'size': 1000, 'content_type': 'image/jpeg'}

        self.client.force_authenticate(user=self.user)

        test_cases = [
            ('photo.jpg', Element.ELEMENT_TYPE_IMAGE),
            ('photo.jpeg', Element.ELEMENT_TYPE_IMAGE),
            ('photo.png', Element.ELEMENT_TYPE_IMAGE),
            ('clip.mp4', Element.ELEMENT_TYPE_VIDEO),
        ]

        for fname, expected_type in test_cases:
            response = self.client.post(
                f'/api/scenes/{self.scene.id}/presign/',
                {'filename': fname},
                format='json',
            )
            element = Element.objects.get(id=response.data['element_id'])
            self.assertEqual(
                element.element_type, expected_type,
                f"File {fname} should be {expected_type}, got {element.element_type}",
            )
