from django.test import TestCase
from django.contrib.auth import get_user_model
from .models import Project
from .services import create_project, update_project, delete_project

User = get_user_model()


class ProjectModelTest(TestCase):
    """Тесты для модели Project."""
    
    def setUp(self):
        """Создание тестового пользователя."""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
    
    def test_create_project(self):
        """Тест создания проекта."""
        project = Project.objects.create(
            user=self.user,
            name='Тестовый проект'
        )
        self.assertEqual(project.name, 'Тестовый проект')
        self.assertEqual(project.user, self.user)
        self.assertIsNotNone(project.created_at)
        self.assertIsNotNone(project.updated_at)
    
    def test_project_str(self):
        """Тест строкового представления проекта."""
        project = Project.objects.create(
            user=self.user,
            name='Мой проект'
        )
        expected_str = f'Мой проект ({self.user.username})'
        self.assertEqual(str(project), expected_str)
    
    def test_project_ordering(self):
        """Тест сортировки проектов по дате создания."""
        project1 = Project.objects.create(user=self.user, name='Проект 1')
        project2 = Project.objects.create(user=self.user, name='Проект 2')
        
        projects = Project.objects.all()
        self.assertEqual(projects[0], project2)  # Новый проект должен быть первым
        self.assertEqual(projects[1], project1)


class ProjectServiceTest(TestCase):
    """Тесты для сервисов работы с проектами."""
    
    def setUp(self):
        """Создание тестового пользователя."""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
    
    def test_create_project_service(self):
        """Тест создания проекта через сервис."""
        project = create_project(user=self.user, name='Новый проект')
        self.assertEqual(project.name, 'Новый проект')
        self.assertEqual(project.user, self.user)
    
    def test_update_project_service(self):
        """Тест обновления проекта через сервис."""
        project = create_project(user=self.user, name='Старое название')
        updated_project = update_project(project, name='Новое название')
        self.assertEqual(updated_project.name, 'Новое название')
    
    def test_delete_project_service(self):
        """Тест удаления проекта через сервис."""
        project = create_project(user=self.user, name='Проект для удаления')
        project_id = project.id
        delete_project(project)
        
        with self.assertRaises(Project.DoesNotExist):
            Project.objects.get(id=project_id)
