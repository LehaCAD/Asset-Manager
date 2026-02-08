from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from apps.projects.models import Project
from apps.boxes.models import Box
from apps.assets.models import Asset
from unittest.mock import patch

User = get_user_model()


class BoxAPITest(APITestCase):
    """Тесты для Boxes API."""
    
    def setUp(self):
        """Создание тестовых пользователей и данных."""
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
        
        self.box1 = Box.objects.create(
            project=self.project1,
            name='Бокс 1',
            order_index=0
        )
        self.box2 = Box.objects.create(
            project=self.project1,
            name='Бокс 2',
            order_index=1
        )
        self.box3 = Box.objects.create(
            project=self.project2,
            name='Бокс пользователя 2',
            order_index=0
        )
        
        # Создать ассеты для подсчета
        Asset.objects.create(
            box=self.box1,
            asset_type=Asset.ASSET_TYPE_IMAGE,
            file_url='https://example.com/1.jpg'
        )
        Asset.objects.create(
            box=self.box1,
            asset_type=Asset.ASSET_TYPE_IMAGE,
            file_url='https://example.com/2.jpg'
        )
        
        self.list_url = reverse('box-list')
    
    def test_list_boxes_unauthorized(self):
        """Тест: неавторизованный пользователь не может получить список."""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
    
    def test_list_boxes_authenticated(self):
        """Тест: пользователь видит только боксы своих проектов."""
        self.client.force_authenticate(user=self.user1)
        response = self.client.get(self.list_url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        self.assertEqual(response.data[0]['assets_count'], 2)
    
    def test_list_boxes_filtered_by_project(self):
        """Тест: фильтрация боксов по project."""
        self.client.force_authenticate(user=self.user1)
        response = self.client.get(f'{self.list_url}?project={self.project1.id}')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        for box in response.data:
            self.assertEqual(box['project'], self.project1.id)
    
    def test_create_box(self):
        """Тест: создание бокса."""
        self.client.force_authenticate(user=self.user1)
        data = {
            'project': self.project1.id,
            'name': 'Новый бокс',
            'order_index': 2
        }
        response = self.client.post(self.list_url, data)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Новый бокс')
        self.assertEqual(response.data['assets_count'], 0)
        self.assertEqual(response.data['project_name'], 'Проект пользователя 1')
    
    def test_create_box_for_other_user_project(self):
        """Тест: нельзя создать бокс в чужом проекте."""
        self.client.force_authenticate(user=self.user1)
        data = {
            'project': self.project2.id,  # Проект user2
            'name': 'Попытка создать бокс',
            'order_index': 0
        }
        response = self.client.post(self.list_url, data)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('project', response.data)
    
    def test_retrieve_box(self):
        """Тест: получение деталей бокса."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('box-detail', kwargs={'pk': self.box1.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Бокс 1')
        self.assertEqual(response.data['assets_count'], 2)
        self.assertEqual(response.data['project_name'], 'Проект пользователя 1')
    
    def test_retrieve_other_user_box(self):
        """Тест: пользователь не может получить чужой бокс."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('box-detail', kwargs={'pk': self.box3.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
    
    def test_update_box(self):
        """Тест: обновление бокса (PUT)."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('box-detail', kwargs={'pk': self.box1.pk})
        data = {
            'project': self.project1.id,
            'name': 'Обновленное название',
            'order_index': 5
        }
        response = self.client.put(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Обновленное название')
        self.assertEqual(response.data['order_index'], 5)
    
    def test_partial_update_box(self):
        """Тест: частичное обновление бокса (PATCH)."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('box-detail', kwargs={'pk': self.box1.pk})
        data = {'name': 'Частично обновлен'}
        response = self.client.patch(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Частично обновлен')
        self.assertEqual(response.data['order_index'], 0)  # Не изменился
    
    def test_delete_box(self):
        """Тест: удаление бокса."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('box-detail', kwargs={'pk': self.box2.pk})
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Box.objects.filter(pk=self.box2.pk).exists())
    
    def test_delete_other_user_box(self):
        """Тест: пользователь не может удалить чужой бокс."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('box-detail', kwargs={'pk': self.box3.pk})
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Box.objects.filter(pk=self.box3.pk).exists())
    
    def test_assets_count_field(self):
        """Тест: поле assets_count правильно подсчитывает ассеты."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('box-detail', kwargs={'pk': self.box1.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.data['assets_count'], 2)
        
        # Добавить еще ассет
        Asset.objects.create(
            box=self.box1,
            asset_type=Asset.ASSET_TYPE_VIDEO,
            file_url='https://example.com/video.mp4'
        )
        response = self.client.get(url)
        self.assertEqual(response.data['assets_count'], 3)
    
    def test_project_name_field(self):
        """Тест: поле project_name возвращает название проекта."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('box-detail', kwargs={'pk': self.box1.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.data['project_name'], 'Проект пользователя 1')
    
    @patch('apps.boxes.views.upload_file_to_s3')
    def test_upload_file(self, mock_upload):
        """Тест: загрузка файла на S3 и создание Asset."""
        # Мокаем загрузку на S3
        mock_upload.return_value = ('https://s3.example.com/uploads/test.jpg', 'test.jpg')
        
        self.client.force_authenticate(user=self.user1)
        url = reverse('box-upload', kwargs={'pk': self.box1.pk})
        
        # Создаем тестовый файл
        file_content = b'fake image content'
        file = SimpleUploadedFile('test.jpg', file_content, content_type='image/jpeg')
        
        data = {
            'file': file,
            'prompt_text': 'Test prompt',
            'is_favorite': True
        }
        
        response = self.client.post(url, data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['box'], self.box1.id)
        self.assertEqual(response.data['asset_type'], Asset.ASSET_TYPE_IMAGE)
        self.assertEqual(response.data['file_url'], 'https://s3.example.com/uploads/test.jpg')
        self.assertEqual(response.data['prompt_text'], 'Test prompt')
        self.assertTrue(response.data['is_favorite'])
        
        # Проверить, что Asset создан в БД
        self.assertTrue(Asset.objects.filter(box=self.box1, file_url='https://s3.example.com/uploads/test.jpg').exists())
    
    @patch('apps.boxes.views.upload_file_to_s3')
    def test_upload_video_file(self, mock_upload):
        """Тест: загрузка видео файла."""
        mock_upload.return_value = ('https://s3.example.com/uploads/test.mp4', 'test.mp4')
        
        self.client.force_authenticate(user=self.user1)
        url = reverse('box-upload', kwargs={'pk': self.box1.pk})
        
        file = SimpleUploadedFile('test.mp4', b'fake video', content_type='video/mp4')
        
        response = self.client.post(url, {'file': file}, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['asset_type'], Asset.ASSET_TYPE_VIDEO)
    
    def test_upload_without_file(self):
        """Тест: ошибка при загрузке без файла."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('box-upload', kwargs={'pk': self.box1.pk})
        
        response = self.client.post(url, {}, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)
    
    def test_upload_to_other_user_box(self):
        """Тест: нельзя загрузить файл в чужой бокс."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('box-upload', kwargs={'pk': self.box3.pk})  # Бокс user2
        
        file = SimpleUploadedFile('test.jpg', b'fake image', content_type='image/jpeg')
        
        response = self.client.post(url, {'file': file}, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

