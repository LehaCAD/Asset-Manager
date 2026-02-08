from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from apps.projects.models import Project
from apps.boxes.models import Box
from apps.assets.models import Asset
from apps.ai_providers.models import AIProvider, AIModel

User = get_user_model()


class AssetAPITest(APITestCase):
    """Тесты для Assets API."""
    
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
            name='Проект 1'
        )
        self.project2 = Project.objects.create(
            user=self.user2,
            name='Проект 2'
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
        
        # Создать AI модель
        provider = AIProvider.objects.create(
            name='Test Provider',
            base_url='https://test.com'
        )
        self.ai_model = AIModel.objects.create(
            provider=provider,
            name='Test Model',
            model_type=AIModel.MODEL_TYPE_IMAGE,
            api_endpoint='/test'
        )
        
        # Создать ассеты
        self.asset1 = Asset.objects.create(
            box=self.box1,
            asset_type=Asset.ASSET_TYPE_IMAGE,
            file_url='https://example.com/1.jpg',
            prompt_text='Test prompt 1',
            is_favorite=True,
            ai_model=self.ai_model
        )
        self.asset2 = Asset.objects.create(
            box=self.box1,
            asset_type=Asset.ASSET_TYPE_VIDEO,
            file_url='https://example.com/2.mp4',
            prompt_text='Test prompt 2',
            is_favorite=False
        )
        self.asset3 = Asset.objects.create(
            box=self.box2,
            asset_type=Asset.ASSET_TYPE_IMAGE,
            file_url='https://example.com/3.jpg',
            is_favorite=True
        )
        self.asset4 = Asset.objects.create(
            box=self.box3,  # Бокс user2
            asset_type=Asset.ASSET_TYPE_IMAGE,
            file_url='https://example.com/4.jpg'
        )
        
        self.list_url = reverse('asset-list')
    
    def test_list_assets_unauthorized(self):
        """Тест: неавторизованный пользователь не может получить список."""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
    
    def test_list_assets_authenticated(self):
        """Тест: пользователь видит только ассеты своих проектов."""
        self.client.force_authenticate(user=self.user1)
        response = self.client.get(self.list_url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 3)  # asset1, asset2, asset3
    
    def test_list_assets_filtered_by_box(self):
        """Тест: фильтрация ассетов по box."""
        self.client.force_authenticate(user=self.user1)
        response = self.client.get(f'{self.list_url}?box={self.box1.id}')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)  # asset1, asset2
    
    def test_list_assets_filtered_by_type(self):
        """Тест: фильтрация по asset_type."""
        self.client.force_authenticate(user=self.user1)
        
        # Только изображения
        response = self.client.get(f'{self.list_url}?asset_type=IMAGE')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)  # asset1, asset3
        
        # Только видео
        response = self.client.get(f'{self.list_url}?asset_type=VIDEO')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)  # asset2
    
    def test_list_assets_filtered_by_favorite(self):
        """Тест: фильтрация по is_favorite."""
        self.client.force_authenticate(user=self.user1)
        
        # Только избранные
        response = self.client.get(f'{self.list_url}?is_favorite=true')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)  # asset1, asset3
        
        # Не избранные
        response = self.client.get(f'{self.list_url}?is_favorite=false')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)  # asset2
    
    def test_create_asset(self):
        """Тест: создание ассета."""
        self.client.force_authenticate(user=self.user1)
        data = {
            'box': self.box1.id,
            'asset_type': Asset.ASSET_TYPE_IMAGE,
            'file_url': 'https://example.com/new.jpg',
            'prompt_text': 'New prompt',
            'is_favorite': False
        }
        response = self.client.post(self.list_url, data)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['asset_type'], Asset.ASSET_TYPE_IMAGE)
        self.assertEqual(response.data['box_name'], 'Бокс 1')
    
    def test_retrieve_asset(self):
        """Тест: получение деталей ассета."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('asset-detail', kwargs={'pk': self.asset1.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['file_url'], 'https://example.com/1.jpg')
        self.assertEqual(response.data['box_name'], 'Бокс 1')
        self.assertEqual(response.data['ai_model_name'], 'Test Model')
    
    def test_retrieve_other_user_asset(self):
        """Тест: пользователь не может получить чужой ассет."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('asset-detail', kwargs={'pk': self.asset4.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
    
    def test_update_asset(self):
        """Тест: обновление ассета (PATCH)."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('asset-detail', kwargs={'pk': self.asset1.pk})
        data = {'is_favorite': False}
        response = self.client.patch(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['is_favorite'])
    
    def test_delete_asset(self):
        """Тест: удаление ассета."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('asset-detail', kwargs={'pk': self.asset2.pk})
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Asset.objects.filter(pk=self.asset2.pk).exists())
    
    def test_delete_other_user_asset(self):
        """Тест: пользователь не может удалить чужой ассет."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('asset-detail', kwargs={'pk': self.asset4.pk})
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Asset.objects.filter(pk=self.asset4.pk).exists())
    
    def test_box_name_field(self):
        """Тест: поле box_name возвращает название бокса."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('asset-detail', kwargs={'pk': self.asset1.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.data['box_name'], 'Бокс 1')
    
    def test_ai_model_name_field(self):
        """Тест: поле ai_model_name возвращает название модели."""
        self.client.force_authenticate(user=self.user1)
        
        # С AI моделью
        url = reverse('asset-detail', kwargs={'pk': self.asset1.pk})
        response = self.client.get(url)
        self.assertEqual(response.data['ai_model_name'], 'Test Model')
        
        # Без AI модели
        url = reverse('asset-detail', kwargs={'pk': self.asset2.pk})
        response = self.client.get(url)
        self.assertIsNone(response.data['ai_model_name'])
    
    def test_combined_filters(self):
        """Тест: комбинация фильтров."""
        self.client.force_authenticate(user=self.user1)
        
        # box + asset_type + is_favorite
        response = self.client.get(
            f'{self.list_url}?box={self.box1.id}&asset_type=IMAGE&is_favorite=true'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)  # Только asset1
