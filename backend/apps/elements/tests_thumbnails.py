"""
Tests for thumbnail_utils — server-side thumbnail generation.

All S3 interactions are mocked. No real network calls.
"""
import os
import tempfile
from io import BytesIO
from unittest.mock import patch, MagicMock, call

from django.test import TestCase
from PIL import Image

from apps.storage.thumbnails import (
    _resize_to_fit,
    generate_thumbnails,
    SMALL_SIZE,
    MEDIUM_SIZE,
    SMALL_QUALITY,
    MEDIUM_QUALITY,
)


def _create_test_image(width=1920, height=1080, color='red'):
    """Create a temp JPEG file for testing."""
    img = Image.new('RGB', (width, height), color=color)
    tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
    img.save(tmp.name, 'JPEG')
    tmp.close()
    return tmp.name


class ResizeToFitTest(TestCase):
    """Tests for _resize_to_fit helper."""

    def test_landscape_image(self):
        """1920x1080 -> max_side 256 -> 256x144."""
        img = Image.new('RGB', (1920, 1080))
        resized = _resize_to_fit(img, 256)
        self.assertEqual(resized.size[0], 256)
        self.assertEqual(resized.size[1], int(1080 * 256 / 1920))  # 144

    def test_portrait_image(self):
        """1080x1920 -> max_side 256 -> 144x256."""
        img = Image.new('RGB', (1080, 1920))
        resized = _resize_to_fit(img, 256)
        self.assertEqual(resized.size[1], 256)
        self.assertEqual(resized.size[0], int(1080 * 256 / 1920))  # 144

    def test_square_image(self):
        """500x500 -> max_side 256 -> 256x256."""
        img = Image.new('RGB', (500, 500))
        resized = _resize_to_fit(img, 256)
        self.assertEqual(resized.size, (256, 256))

    def test_small_image_no_upscale(self):
        """100x100 -> max_side 256 -> stays 100x100 (no upscale)."""
        img = Image.new('RGB', (100, 100))
        resized = _resize_to_fit(img, 256)
        self.assertEqual(resized.size, (100, 100))

    def test_very_small_image_no_upscale(self):
        """10x10 -> max_side 256 -> stays 10x10."""
        img = Image.new('RGB', (10, 10))
        resized = _resize_to_fit(img, 256)
        self.assertEqual(resized.size, (10, 10))

    def test_exact_max_side(self):
        """256x256 -> max_side 256 -> stays 256x256."""
        img = Image.new('RGB', (256, 256))
        resized = _resize_to_fit(img, 256)
        self.assertEqual(resized.size, (256, 256))

    def test_returns_copy_when_small(self):
        """When image is smaller than max_side, should return a copy (not the same object)."""
        img = Image.new('RGB', (100, 50))
        resized = _resize_to_fit(img, 256)
        self.assertIsNot(resized, img)
        self.assertEqual(resized.size, (100, 50))

    def test_landscape_aspect_ratio_preserved(self):
        """Aspect ratio should be preserved within rounding."""
        img = Image.new('RGB', (3840, 2160))
        resized = _resize_to_fit(img, 800)
        # 3840/2160 ≈ 1.778, 800/new_h should be close
        self.assertEqual(resized.size[0], 800)
        expected_h = int(2160 * 800 / 3840)
        self.assertEqual(resized.size[1], expected_h)


class GenerateThumbnailsImageTest(TestCase):
    """Tests for generate_thumbnails with element_type=IMAGE."""

    def setUp(self):
        self.temp_path = _create_test_image(1920, 1080)

    def tearDown(self):
        if os.path.exists(self.temp_path):
            os.unlink(self.temp_path)

    @patch('apps.common.thumbnail_utils.default_storage')
    def test_returns_both_urls(self, mock_storage):
        """Should return both thumbnail_url and preview_url."""
        mock_storage.save.return_value = 'saved/path.jpg'
        mock_storage.url.return_value = 'https://cdn.example.com/saved/path.jpg'

        result = generate_thumbnails(self.temp_path, 'IMAGE', project_id=42, scene_id=7)

        self.assertIn('thumbnail_url', result)
        self.assertIn('preview_url', result)
        self.assertTrue(len(result['thumbnail_url']) > 0)
        self.assertTrue(len(result['preview_url']) > 0)

    @patch('apps.common.thumbnail_utils.default_storage')
    def test_saves_two_variants(self, mock_storage):
        """Should call default_storage.save twice (small + medium)."""
        mock_storage.save.return_value = 'saved/path.jpg'
        mock_storage.url.return_value = 'https://cdn.example.com/saved/path.jpg'

        generate_thumbnails(self.temp_path, 'IMAGE', project_id=42, scene_id=7)

        self.assertEqual(mock_storage.save.call_count, 2)

    @patch('apps.common.thumbnail_utils.default_storage')
    def test_saved_images_have_correct_dimensions(self, mock_storage):
        """Intercept save calls to verify dimensions of saved thumbnails."""
        saved_images = []

        def capture_save(key, content_file):
            img_data = content_file.read()
            img = Image.open(BytesIO(img_data))
            saved_images.append({'key': key, 'size': img.size})
            return key

        mock_storage.save.side_effect = capture_save
        mock_storage.url.return_value = 'https://cdn.example.com/thumb.jpg'

        generate_thumbnails(self.temp_path, 'IMAGE', project_id=42, scene_id=7)

        self.assertEqual(len(saved_images), 2)

        # First save is small (256px max side for 1920x1080 -> 256x144)
        small = saved_images[0]
        self.assertEqual(small['size'][0], 256)
        self.assertEqual(small['size'][1], int(1080 * 256 / 1920))

        # Second save is medium (800px max side for 1920x1080 -> 800x450)
        medium = saved_images[1]
        self.assertEqual(medium['size'][0], 800)
        self.assertEqual(medium['size'][1], int(1080 * 800 / 1920))

    @patch('apps.common.thumbnail_utils.default_storage')
    def test_s3_key_contains_scene_id(self, mock_storage):
        """S3 key should contain projects/{id}/scenes/{scene_id}/."""
        mock_storage.save.return_value = 'saved/path.jpg'
        mock_storage.url.return_value = 'https://cdn.example.com/thumb.jpg'

        generate_thumbnails(self.temp_path, 'IMAGE', project_id=42, scene_id=7)

        for call_args in mock_storage.save.call_args_list:
            key = call_args[0][0]
            self.assertIn('projects/42/scenes/7/', key)

    @patch('apps.common.thumbnail_utils.default_storage')
    def test_small_image_preserved(self, mock_storage):
        """Small source image (100x80) should not be upscaled."""
        small_path = _create_test_image(100, 80)
        saved_images = []

        def capture_save(key, content_file):
            img_data = content_file.read()
            img = Image.open(BytesIO(img_data))
            saved_images.append({'key': key, 'size': img.size})
            return key

        mock_storage.save.side_effect = capture_save
        mock_storage.url.return_value = 'https://cdn.example.com/thumb.jpg'

        try:
            generate_thumbnails(small_path, 'IMAGE', project_id=1, scene_id=1)

            # Both small and medium should be 100x80 (no upscale)
            for entry in saved_images:
                self.assertEqual(entry['size'], (100, 80))
        finally:
            os.unlink(small_path)


class GenerateThumbnailsVideoTest(TestCase):
    """Tests for generate_thumbnails with element_type=VIDEO."""

    @patch('apps.common.thumbnail_utils.default_storage')
    @patch('apps.common.thumbnail_utils.subprocess.run')
    def test_returns_both_urls(self, mock_subprocess, mock_storage):
        """VIDEO type should extract frame via ffmpeg and return both URLs."""
        # Create a fake video temp path (doesn't matter, ffmpeg is mocked)
        video_tmp = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
        video_tmp.close()

        # ffmpeg mock: when subprocess.run is called, create a fake JPEG at the output path
        def fake_ffmpeg(cmd, **kwargs):
            # The output path is the last argument in the ffmpeg command
            output_path = cmd[-1]
            img = Image.new('RGB', (1920, 1080), color='blue')
            img.save(output_path, 'JPEG')
            return MagicMock(returncode=0)

        mock_subprocess.side_effect = fake_ffmpeg
        mock_storage.save.return_value = 'saved/video_thumb.jpg'
        mock_storage.url.return_value = 'https://cdn.example.com/video_thumb.jpg'

        try:
            result = generate_thumbnails(video_tmp.name, 'VIDEO', project_id=10, scene_id=3)

            self.assertIn('thumbnail_url', result)
            self.assertIn('preview_url', result)
            self.assertTrue(len(result['thumbnail_url']) > 0)
            self.assertTrue(len(result['preview_url']) > 0)
        finally:
            if os.path.exists(video_tmp.name):
                os.unlink(video_tmp.name)

    @patch('apps.common.thumbnail_utils.default_storage')
    @patch('apps.common.thumbnail_utils.subprocess.run')
    def test_calls_ffmpeg_with_correct_args(self, mock_subprocess, mock_storage):
        """Should call ffmpeg with -vframes 1 to extract a single frame."""
        video_tmp = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
        video_tmp.close()

        def fake_ffmpeg(cmd, **kwargs):
            output_path = cmd[-1]
            img = Image.new('RGB', (640, 480), color='green')
            img.save(output_path, 'JPEG')
            return MagicMock(returncode=0)

        mock_subprocess.side_effect = fake_ffmpeg
        mock_storage.save.return_value = 'saved/thumb.jpg'
        mock_storage.url.return_value = 'https://cdn.example.com/thumb.jpg'

        try:
            generate_thumbnails(video_tmp.name, 'VIDEO', project_id=10, scene_id=3)

            mock_subprocess.assert_called_once()
            cmd = mock_subprocess.call_args[0][0]
            self.assertEqual(cmd[0], 'ffmpeg')
            self.assertIn('-vframes', cmd)
            self.assertIn('1', cmd)
            self.assertIn(video_tmp.name, cmd)
        finally:
            if os.path.exists(video_tmp.name):
                os.unlink(video_tmp.name)


class GenerateThumbnailsErrorHandlingTest(TestCase):
    """Tests for generate_thumbnails error handling — should never raise."""

    def test_nonexistent_file_returns_empties(self):
        """Non-existent file -> returns {'thumbnail_url': '', 'preview_url': ''}, no exception."""
        result = generate_thumbnails(
            '/nonexistent/path/to/file.jpg', 'IMAGE', project_id=1, scene_id=1,
        )
        self.assertEqual(result, {'thumbnail_url': '', 'preview_url': ''})

    def test_invalid_image_file_returns_empties(self):
        """Invalid image data -> returns empties, no exception."""
        tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
        tmp.write(b'this is not a valid jpeg')
        tmp.close()

        try:
            result = generate_thumbnails(tmp.name, 'IMAGE', project_id=1, scene_id=1)
            self.assertEqual(result, {'thumbnail_url': '', 'preview_url': ''})
        finally:
            os.unlink(tmp.name)

    def test_unknown_element_type_returns_empties(self):
        """Unknown element_type -> returns empties."""
        tmp = _create_test_image(100, 100)
        try:
            result = generate_thumbnails(tmp, 'UNKNOWN_TYPE', project_id=1, scene_id=1)
            self.assertEqual(result, {'thumbnail_url': '', 'preview_url': ''})
        finally:
            os.unlink(tmp)

    @patch('apps.common.thumbnail_utils.default_storage')
    def test_s3_save_failure_returns_empties(self, mock_storage):
        """If S3 save raises, should return empty URLs."""
        mock_storage.save.side_effect = Exception('S3 connection failed')

        tmp = _create_test_image(200, 200)
        try:
            result = generate_thumbnails(tmp, 'IMAGE', project_id=1, scene_id=1)
            # Both should be empty string (None gets converted to '')
            self.assertEqual(result['thumbnail_url'], '')
            self.assertEqual(result['preview_url'], '')
        finally:
            os.unlink(tmp)


class GenerateThumbnailsSceneIdNullTest(TestCase):
    """Tests for generate_thumbnails with scene_id=None (root level)."""

    @patch('apps.common.thumbnail_utils.default_storage')
    def test_root_level_key_prefix(self, mock_storage):
        """scene_id=None -> S3 key should be projects/{id}/root/ not projects/{id}/scenes/None/."""
        mock_storage.save.return_value = 'saved/path.jpg'
        mock_storage.url.return_value = 'https://cdn.example.com/thumb.jpg'

        tmp = _create_test_image(400, 300)
        try:
            generate_thumbnails(tmp, 'IMAGE', project_id=42, scene_id=None)

            for call_args in mock_storage.save.call_args_list:
                key = call_args[0][0]
                self.assertIn('projects/42/root/', key)
                self.assertNotIn('scenes/None', key)
        finally:
            os.unlink(tmp)

    @patch('apps.common.thumbnail_utils.default_storage')
    def test_root_level_returns_urls(self, mock_storage):
        """Root-level thumbnails should still return valid URLs."""
        mock_storage.save.return_value = 'projects/42/root/abc_small.jpg'
        mock_storage.url.return_value = 'https://cdn.example.com/projects/42/root/abc_small.jpg'

        tmp = _create_test_image(400, 300)
        try:
            result = generate_thumbnails(tmp, 'IMAGE', project_id=42, scene_id=None)
            self.assertTrue(result['thumbnail_url'].startswith('https://'))
            self.assertTrue(result['preview_url'].startswith('https://'))
        finally:
            os.unlink(tmp)
