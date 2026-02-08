from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from apps.projects.models import Project
from apps.boxes.models import Box

User = get_user_model()


class ProjectAPITest(APITestCase):
    """Тесты для Projects API."""
    
    def setUp(self):
        """Создание тестовых пользователей и проектов."""
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
        
        # Создать боксы для подсчета
        Box.objects.create(project=self.project1, name='Бокс 1', order_index=0)
        Box.objects.create(project=self.project1, name='Бокс 2', order_index=1)
        
        self.list_url = reverse('project-list')
    
    def test_list_projects_unauthorized(self):
        """Тест: неавторизованный пользователь не может получить список."""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
    
    def test_list_projects_authenticated(self):
        """Тест: пользователь видит только свои проекты."""
        self.client.force_authenticate(user=self.user1)
        response = self.client.get(self.list_url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Проект пользователя 1')
        self.assertEqual(response.data[0]['boxes_count'], 2)
    
    def test_create_project(self):
        """Тест: создание проекта."""
        self.client.force_authenticate(user=self.user1)
        data = {'name': 'Новый проект'}
        response = self.client.post(self.list_url, data)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Новый проект')
        self.assertEqual(response.data['boxes_count'], 0)
        
        # Проверка, что user установлен автоматически
        project = Project.objects.get(id=response.data['id'])
        self.assertEqual(project.user, self.user1)
    
    def test_retrieve_project(self):
        """Тест: получение деталей проекта."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('project-detail', kwargs={'pk': self.project1.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Проект пользователя 1')
        self.assertEqual(response.data['boxes_count'], 2)
    
    def test_retrieve_other_user_project(self):
        """Тест: пользователь не может получить чужой проект."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('project-detail', kwargs={'pk': self.project2.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
    
    def test_update_project(self):
        """Тест: обновление проекта (PUT)."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('project-detail', kwargs={'pk': self.project1.pk})
        data = {'name': 'Обновленное название'}
        response = self.client.put(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Обновленное название')
        
        # Проверка в БД
        self.project1.refresh_from_db()
        self.assertEqual(self.project1.name, 'Обновленное название')
    
    def test_partial_update_project(self):
        """Тест: частичное обновление проекта (PATCH)."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('project-detail', kwargs={'pk': self.project1.pk})
        data = {'name': 'Частично обновлен'}
        response = self.client.patch(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Частично обновлен')
    
    def test_delete_project(self):
        """Тест: удаление проекта."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('project-detail', kwargs={'pk': self.project1.pk})
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Project.objects.filter(pk=self.project1.pk).exists())
    
    def test_delete_other_user_project(self):
        """Тест: пользователь не может удалить чужой проект."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('project-detail', kwargs={'pk': self.project2.pk})
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Project.objects.filter(pk=self.project2.pk).exists())
    
    def test_boxes_count_field(self):
        """Тест: поле boxes_count правильно подсчитывает боксы."""
        self.client.force_authenticate(user=self.user1)
        url = reverse('project-detail', kwargs={'pk': self.project1.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.data['boxes_count'], 2)
        
        # Добавить еще бокс
        Box.objects.create(project=self.project1, name='Бокс 3', order_index=2)
        response = self.client.get(url)
        self.assertEqual(response.data['boxes_count'], 3)
