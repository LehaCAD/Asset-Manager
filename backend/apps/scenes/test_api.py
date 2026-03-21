from decimal import Decimal

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from apps.projects.models import Project
from apps.scenes.models import Scene
from apps.elements.models import Element
from apps.ai_providers.models import AIModel, AIProvider, CanonicalParameter, ModelParameterBinding
from apps.credits.models import CreditsTransaction
from unittest.mock import patch

User = get_user_model()


class SceneAPITest(APITestCase):
    """Тесты для Scenes API."""
    
    def setUp(self):
        self.user1 = User.objects.create_user(
            username='user1',
            email='user1@example.com',
            password='testpass123'
        )
        self.user2 = User.objects.create_user(
            username='user2',
            email='user2@example.com',
            password='testpass123'
        )
        
        self.project1 = Project.objects.create(
            user=self.user1,
            name='Проект пользователя 1'
        )
        self.project2 = Project.objects.create(
            user=self.user2,
            name='Проект пользователя 2'
        )
        
        self.scene1 = Scene.objects.create(
            project=self.project1,
            name='Сцена 1',
            order_index=0
        )
        self.scene2 = Scene.objects.create(
            project=self.project1,
            name='Сцена 2',
            order_index=1
        )
        self.scene3 = Scene.objects.create(
            project=self.project2,
            name='Сцена пользователя 2',
            order_index=0
        )
        
        Element.objects.create(
            project=self.project1,
            scene=self.scene1,
            element_type=Element.ELEMENT_TYPE_IMAGE,
            file_url='https://example.com/1.jpg'
        )
        Element.objects.create(
            project=self.project1,
            scene=self.scene1,
            element_type=Element.ELEMENT_TYPE_IMAGE,
            file_url='https://example.com/2.jpg'
        )
        
        self.list_url = reverse('scene-list')
    
    def test_list_scenes_unauthorized(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_list_scenes_authenticated(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.get(self.list_url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        self.assertEqual(response.data[0]['elements_count'], 2)
    
    def test_list_scenes_filtered_by_project(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.get(f'{self.list_url}?project={self.project1.id}')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        for scene in response.data:
            self.assertEqual(scene['project'], self.project1.id)
    
    def test_create_scene(self):
        self.client.force_authenticate(user=self.user1)
        data = {
            'project': self.project1.id,
            'name': 'Новая сцена',
            'order_index': 2
        }
        response = self.client.post(self.list_url, data)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Новая сцена')
        self.assertEqual(response.data['elements_count'], 0)
        self.assertEqual(response.data['project_name'], 'Проект пользователя 1')
    
    def test_create_scene_for_other_user_project(self):
        self.client.force_authenticate(user=self.user1)
        data = {
            'project': self.project2.id,
            'name': 'Попытка создать сцену',
            'order_index': 0
        }
        response = self.client.post(self.list_url, data)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('project', response.data)
    
    def test_retrieve_scene(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('scene-detail', kwargs={'pk': self.scene1.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Сцена 1')
        self.assertEqual(response.data['elements_count'], 2)
        self.assertEqual(response.data['project_name'], 'Проект пользователя 1')
    
    def test_retrieve_other_user_scene(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('scene-detail', kwargs={'pk': self.scene3.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
    
    def test_update_scene(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('scene-detail', kwargs={'pk': self.scene1.pk})
        data = {
            'project': self.project1.id,
            'name': 'Обновленное название',
            'order_index': 5
        }
        response = self.client.put(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Обновленное название')
        self.assertEqual(response.data['order_index'], 5)
    
    def test_partial_update_scene(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('scene-detail', kwargs={'pk': self.scene1.pk})
        data = {'name': 'Частично обновлена'}
        response = self.client.patch(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Частично обновлена')
        self.assertEqual(response.data['order_index'], 0)
    
    def test_delete_scene(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('scene-detail', kwargs={'pk': self.scene2.pk})
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Scene.objects.filter(pk=self.scene2.pk).exists())
    
    def test_delete_other_user_scene(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('scene-detail', kwargs={'pk': self.scene3.pk})
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Scene.objects.filter(pk=self.scene3.pk).exists())
    
    def test_elements_count_field(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('scene-detail', kwargs={'pk': self.scene1.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.data['elements_count'], 2)
        
        Element.objects.create(
            project=self.project1,
            scene=self.scene1,
            element_type=Element.ELEMENT_TYPE_VIDEO,
            file_url='https://example.com/video.mp4'
        )
        response = self.client.get(url)
        self.assertEqual(response.data['elements_count'], 3)
    
    def test_project_name_field(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('scene-detail', kwargs={'pk': self.scene1.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.data['project_name'], 'Проект пользователя 1')
    
    @patch('apps.elements.tasks.process_uploaded_file.delay')
    @patch('apps.scenes.s3_utils.save_to_staging')
    def test_upload_file(self, mock_save_to_staging, mock_process_delay):
        mock_save_to_staging.return_value = '/tmp/test-upload.jpg'
        
        self.client.force_authenticate(user=self.user1)
        url = reverse('scene-upload', kwargs={'pk': self.scene1.pk})
        
        file_content = b'fake image content'
        file = SimpleUploadedFile('test.jpg', file_content, content_type='image/jpeg')
        
        data = {
            'file': file,
            'prompt_text': 'Test prompt',
            'is_favorite': True
        }
        
        response = self.client.post(url, data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['scene'], self.scene1.id)
        self.assertEqual(response.data['element_type'], Element.ELEMENT_TYPE_IMAGE)
        self.assertEqual(response.data['file_url'], '')
        self.assertEqual(response.data['prompt_text'], 'Test prompt')
        self.assertTrue(response.data['is_favorite'])
        self.assertEqual(response.data['status'], Element.STATUS_PROCESSING)
        self.assertEqual(response.data['source_type'], Element.SOURCE_UPLOADED)
        
        element = Element.objects.get(scene=self.scene1, prompt_text='Test prompt')
        self.assertEqual(element.file_url, '')
        self.assertEqual(element.status, Element.STATUS_PROCESSING)
        mock_save_to_staging.assert_called_once()
        mock_process_delay.assert_called_once_with(element.id, '/tmp/test-upload.jpg')
    
    @patch('apps.elements.tasks.process_uploaded_file.delay')
    @patch('apps.scenes.s3_utils.save_to_staging')
    def test_upload_video_file(self, mock_save_to_staging, mock_process_delay):
        mock_save_to_staging.return_value = '/tmp/test-upload.mp4'
        
        self.client.force_authenticate(user=self.user1)
        url = reverse('scene-upload', kwargs={'pk': self.scene1.pk})
        
        file = SimpleUploadedFile('test.mp4', b'fake video', content_type='video/mp4')
        
        response = self.client.post(url, {'file': file}, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['element_type'], Element.ELEMENT_TYPE_VIDEO)
        self.assertEqual(response.data['status'], Element.STATUS_PROCESSING)
        self.assertEqual(response.data['source_type'], Element.SOURCE_UPLOADED)

        element = Element.objects.get(scene=self.scene1, element_type=Element.ELEMENT_TYPE_VIDEO)
        mock_save_to_staging.assert_called_once()
        mock_process_delay.assert_called_once_with(element.id, '/tmp/test-upload.mp4')
    
    def test_upload_without_file(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('scene-upload', kwargs={'pk': self.scene1.pk})
        
        response = self.client.post(url, {}, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)
    
    def test_upload_to_other_user_scene(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('scene-upload', kwargs={'pk': self.scene3.pk})
        
        file = SimpleUploadedFile('test.jpg', b'fake image', content_type='image/jpeg')
        
        response = self.client.post(url, {'file': file}, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class SceneGenerateDebitRollbackTests(APITestCase):
    @override_settings(DEBUG=True)
    @patch("apps.elements.serializers.ElementSerializer.save", side_effect=RuntimeError("boom"))
    def test_refunds_if_element_creation_fails_after_debit(self, _save):
        user = User.objects.create_user(
            username="billing-user",
            password="x",
            balance=Decimal("100.00"),
        )
        project = Project.objects.create(user=user, name="Project")
        scene = Scene.objects.create(project=project, name="Scene", order_index=0)
        provider = AIProvider.objects.create(
            name="Provider",
            base_url="https://example.com",
            is_active=True,
        )
        model = AIModel.objects.create(
            provider=provider,
            name="Model",
            model_type=AIModel.MODEL_TYPE_IMAGE,
            api_endpoint="/generate",
            pricing_schema={"fixed_cost": "10.00"},
            is_active=True,
        )

        self.client.force_authenticate(user=user)
        response = self.client.post(
            reverse("scene-generate", args=[scene.id]),
            {
                "prompt": "test",
                "ai_model_id": model.id,
                "generation_config": {"width": 512, "height": 512},
            },
            format="json",
        )

        user.refresh_from_db()
        assert response.status_code == 500
        assert user.balance == Decimal("100.00")
        assert CreditsTransaction.objects.filter(user=user).count() == 2


class AIModelRuntimeConfigApiTests(APITestCase):
    def test_ai_model_list_returns_compiled_parameters_schema(self):
        user = User.objects.create_user(username="runtime-user", password="x")
        provider = AIProvider.objects.create(
            name="Provider",
            base_url="https://example.com",
            is_active=True,
        )
        model = AIModel.objects.create(
            provider=provider,
            name="Compiled Model",
            model_type=AIModel.MODEL_TYPE_VIDEO,
            api_endpoint="/generate",
            request_schema={"duration": "{{videoDuration}}"},
            parameters_schema={"legacy": {"type": "ignore-me"}},
            is_active=True,
        )
        duration = CanonicalParameter.objects.create(
            code="duration",
            ui_semantic="duration",
            value_type="enum",
            aliases=["videoDuration"],
            default_ui_control="select",
            base_options=[{"value": 5, "label": "5 sec"}],
        )
        ModelParameterBinding.objects.create(
            ai_model=model,
            canonical_parameter=duration,
            placeholder="videoDuration",
            request_path="duration",
            default_override=5,
            sort_order=10,
        )

        self.client.force_authenticate(user=user)
        response = self.client.get(reverse("ai-model-list"))

        assert response.status_code == 200
        assert response.data[0]["parameters_schema"][0]["request_key"] == "videoDuration"
        assert response.data[0]["parameters_schema"][0]["ui_semantic"] == "duration"
