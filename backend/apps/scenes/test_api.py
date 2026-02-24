from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from apps.projects.models import Project
from apps.scenes.models import Scene
from apps.elements.models import Element
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
            scene=self.scene1,
            element_type=Element.ELEMENT_TYPE_IMAGE,
            file_url='https://example.com/1.jpg'
        )
        Element.objects.create(
            scene=self.scene1,
            element_type=Element.ELEMENT_TYPE_IMAGE,
            file_url='https://example.com/2.jpg'
        )
        
        self.list_url = reverse('scene-list')
    
    def test_list_scenes_unauthorized(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
    
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
    
    @patch('apps.scenes.views.upload_file_to_s3')
    def test_upload_file(self, mock_upload):
        mock_upload.return_value = ('https://s3.example.com/uploads/test.jpg', 'test.jpg')
        
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
        self.assertEqual(response.data['file_url'], 'https://s3.example.com/uploads/test.jpg')
        self.assertEqual(response.data['prompt_text'], 'Test prompt')
        self.assertTrue(response.data['is_favorite'])
        
        self.assertTrue(Element.objects.filter(scene=self.scene1, file_url='https://s3.example.com/uploads/test.jpg').exists())
    
    @patch('apps.scenes.views.upload_file_to_s3')
    def test_upload_video_file(self, mock_upload):
        mock_upload.return_value = ('https://s3.example.com/uploads/test.mp4', 'test.mp4')
        
        self.client.force_authenticate(user=self.user1)
        url = reverse('scene-upload', kwargs={'pk': self.scene1.pk})
        
        file = SimpleUploadedFile('test.mp4', b'fake video', content_type='video/mp4')
        
        response = self.client.post(url, {'file': file}, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['element_type'], Element.ELEMENT_TYPE_VIDEO)
    
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
