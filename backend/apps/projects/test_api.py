from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from apps.projects.models import Project
from apps.scenes.models import Scene

User = get_user_model()


class ProjectAPITest(APITestCase):
    """Тесты для Projects API."""
    
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
        
        Scene.objects.create(project=self.project1, name='Сцена 1', order_index=0)
        Scene.objects.create(project=self.project1, name='Сцена 2', order_index=1)
        
        self.list_url = reverse('project-list')
    
    def test_list_projects_unauthorized(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
    
    def test_list_projects_authenticated(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.get(self.list_url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Проект пользователя 1')
        self.assertEqual(response.data[0]['scenes_count'], 2)
    
    def test_create_project(self):
        self.client.force_authenticate(user=self.user1)
        data = {'name': 'Новый проект'}
        response = self.client.post(self.list_url, data)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Новый проект')
        self.assertEqual(response.data['scenes_count'], 0)
        
        project = Project.objects.get(id=response.data['id'])
        self.assertEqual(project.user, self.user1)
    
    def test_retrieve_project(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('project-detail', kwargs={'pk': self.project1.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Проект пользователя 1')
        self.assertEqual(response.data['scenes_count'], 2)
    
    def test_retrieve_other_user_project(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('project-detail', kwargs={'pk': self.project2.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
    
    def test_update_project(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('project-detail', kwargs={'pk': self.project1.pk})
        data = {'name': 'Обновленное название'}
        response = self.client.put(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Обновленное название')
        
        self.project1.refresh_from_db()
        self.assertEqual(self.project1.name, 'Обновленное название')
    
    def test_partial_update_project(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('project-detail', kwargs={'pk': self.project1.pk})
        data = {'name': 'Частично обновлен'}
        response = self.client.patch(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Частично обновлен')
    
    def test_delete_project(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('project-detail', kwargs={'pk': self.project1.pk})
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Project.objects.filter(pk=self.project1.pk).exists())
    
    def test_delete_other_user_project(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('project-detail', kwargs={'pk': self.project2.pk})
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Project.objects.filter(pk=self.project2.pk).exists())
    
    def test_scenes_count_field(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('project-detail', kwargs={'pk': self.project1.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.data['scenes_count'], 2)
        
        Scene.objects.create(project=self.project1, name='Сцена 3', order_index=2)
        response = self.client.get(url)
        self.assertEqual(response.data['scenes_count'], 3)
