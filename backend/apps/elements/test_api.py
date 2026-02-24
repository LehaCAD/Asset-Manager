from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from apps.projects.models import Project
from apps.scenes.models import Scene
from apps.elements.models import Element
from apps.ai_providers.models import AIProvider, AIModel

User = get_user_model()


class ElementAPITest(APITestCase):
    """Тесты для Elements API."""
    
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
            name='Проект 1'
        )
        self.project2 = Project.objects.create(
            user=self.user2,
            name='Проект 2'
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
        
        self.element1 = Element.objects.create(
            scene=self.scene1,
            element_type=Element.ELEMENT_TYPE_IMAGE,
            file_url='https://example.com/1.jpg',
            prompt_text='Test prompt 1',
            is_favorite=True,
            ai_model=self.ai_model
        )
        self.element2 = Element.objects.create(
            scene=self.scene1,
            element_type=Element.ELEMENT_TYPE_VIDEO,
            file_url='https://example.com/2.mp4',
            prompt_text='Test prompt 2',
            is_favorite=False
        )
        self.element3 = Element.objects.create(
            scene=self.scene2,
            element_type=Element.ELEMENT_TYPE_IMAGE,
            file_url='https://example.com/3.jpg',
            is_favorite=True
        )
        self.element4 = Element.objects.create(
            scene=self.scene3,
            element_type=Element.ELEMENT_TYPE_IMAGE,
            file_url='https://example.com/4.jpg'
        )
        
        self.list_url = reverse('element-list')
    
    def test_list_elements_unauthorized(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
    
    def test_list_elements_authenticated(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.get(self.list_url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 3)
    
    def test_list_elements_filtered_by_scene(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.get(f'{self.list_url}?scene={self.scene1.id}')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
    
    def test_list_elements_filtered_by_type(self):
        self.client.force_authenticate(user=self.user1)
        
        response = self.client.get(f'{self.list_url}?element_type=IMAGE')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        
        response = self.client.get(f'{self.list_url}?element_type=VIDEO')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
    
    def test_list_elements_filtered_by_favorite(self):
        self.client.force_authenticate(user=self.user1)
        
        response = self.client.get(f'{self.list_url}?is_favorite=true')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        
        response = self.client.get(f'{self.list_url}?is_favorite=false')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
    
    def test_create_element(self):
        self.client.force_authenticate(user=self.user1)
        data = {
            'scene': self.scene1.id,
            'element_type': Element.ELEMENT_TYPE_IMAGE,
            'file_url': 'https://example.com/new.jpg',
            'prompt_text': 'New prompt',
            'is_favorite': False
        }
        response = self.client.post(self.list_url, data)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['element_type'], Element.ELEMENT_TYPE_IMAGE)
        self.assertEqual(response.data['scene_name'], 'Сцена 1')
    
    def test_retrieve_element(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('element-detail', kwargs={'pk': self.element1.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['file_url'], 'https://example.com/1.jpg')
        self.assertEqual(response.data['scene_name'], 'Сцена 1')
        self.assertEqual(response.data['ai_model_name'], 'Test Model')
    
    def test_retrieve_other_user_element(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('element-detail', kwargs={'pk': self.element4.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
    
    def test_update_element(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('element-detail', kwargs={'pk': self.element1.pk})
        data = {'is_favorite': False}
        response = self.client.patch(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['is_favorite'])
    
    def test_delete_element(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('element-detail', kwargs={'pk': self.element2.pk})
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Element.objects.filter(pk=self.element2.pk).exists())
    
    def test_delete_other_user_element(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('element-detail', kwargs={'pk': self.element4.pk})
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Element.objects.filter(pk=self.element4.pk).exists())
    
    def test_scene_name_field(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('element-detail', kwargs={'pk': self.element1.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.data['scene_name'], 'Сцена 1')
    
    def test_ai_model_name_field(self):
        self.client.force_authenticate(user=self.user1)
        
        url = reverse('element-detail', kwargs={'pk': self.element1.pk})
        response = self.client.get(url)
        self.assertEqual(response.data['ai_model_name'], 'Test Model')
        
        url = reverse('element-detail', kwargs={'pk': self.element2.pk})
        response = self.client.get(url)
        self.assertIsNone(response.data['ai_model_name'])
    
    def test_combined_filters(self):
        self.client.force_authenticate(user=self.user1)
        
        response = self.client.get(
            f'{self.list_url}?scene={self.scene1.id}&element_type=IMAGE&is_favorite=true'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
