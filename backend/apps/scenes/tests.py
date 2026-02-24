from django.test import TestCase
from django.contrib.auth import get_user_model
from apps.projects.models import Project
from .models import Scene
from .services import create_scene, update_scene, reorder_scenes, delete_scene, get_project_scenes

User = get_user_model()


class SceneModelTest(TestCase):
    """Тесты для модели Scene."""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.project = Project.objects.create(
            user=self.user,
            name='Тестовый проект'
        )
    
    def test_create_scene(self):
        scene = Scene.objects.create(
            project=self.project,
            name='Тестовая сцена',
            order_index=0
        )
        self.assertEqual(scene.name, 'Тестовая сцена')
        self.assertEqual(scene.project, self.project)
        self.assertEqual(scene.order_index, 0)
        self.assertIsNotNone(scene.created_at)
        self.assertIsNotNone(scene.updated_at)
    
    def test_scene_str(self):
        scene = Scene.objects.create(
            project=self.project,
            name='Моя сцена',
            order_index=1
        )
        expected_str = f'Моя сцена (Проект: {self.project.name})'
        self.assertEqual(str(scene), expected_str)
    
    def test_scene_ordering(self):
        scene1 = Scene.objects.create(project=self.project, name='Сцена 1', order_index=2)
        scene2 = Scene.objects.create(project=self.project, name='Сцена 2', order_index=0)
        scene3 = Scene.objects.create(project=self.project, name='Сцена 3', order_index=1)
        
        scenes = Scene.objects.all()
        self.assertEqual(scenes[0], scene2)
        self.assertEqual(scenes[1], scene3)
        self.assertEqual(scenes[2], scene1)
    
    def test_scene_related_name(self):
        Scene.objects.create(project=self.project, name='Сцена 1', order_index=0)
        Scene.objects.create(project=self.project, name='Сцена 2', order_index=1)
        
        self.assertEqual(self.project.scenes.count(), 2)
        self.assertEqual(self.project.scenes.first().name, 'Сцена 1')


class SceneServiceTest(TestCase):
    """Тесты для сервисов работы со сценами."""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.project = Project.objects.create(
            user=self.user,
            name='Тестовый проект'
        )
    
    def test_create_scene_service(self):
        scene = create_scene(project=self.project, name='Новая сцена', order_index=5)
        self.assertEqual(scene.name, 'Новая сцена')
        self.assertEqual(scene.project, self.project)
        self.assertEqual(scene.order_index, 5)
    
    def test_update_scene_service(self):
        scene = create_scene(project=self.project, name='Старое название')
        updated_scene = update_scene(scene, name='Новое название', order_index=10)
        self.assertEqual(updated_scene.name, 'Новое название')
        self.assertEqual(updated_scene.order_index, 10)
    
    def test_reorder_scenes_service(self):
        scene1 = create_scene(project=self.project, name='Сцена 1', order_index=0)
        scene2 = create_scene(project=self.project, name='Сцена 2', order_index=1)
        scene3 = create_scene(project=self.project, name='Сцена 3', order_index=2)
        
        reorder_scenes([scene3.id, scene1.id, scene2.id])
        
        scene1.refresh_from_db()
        scene2.refresh_from_db()
        scene3.refresh_from_db()
        
        self.assertEqual(scene3.order_index, 0)
        self.assertEqual(scene1.order_index, 1)
        self.assertEqual(scene2.order_index, 2)
    
    def test_delete_scene_service(self):
        scene = create_scene(project=self.project, name='Сцена для удаления')
        scene_id = scene.id
        delete_scene(scene)
        
        with self.assertRaises(Scene.DoesNotExist):
            Scene.objects.get(id=scene_id)
    
    def test_get_project_scenes_service(self):
        create_scene(project=self.project, name='Сцена 1', order_index=2)
        create_scene(project=self.project, name='Сцена 2', order_index=0)
        create_scene(project=self.project, name='Сцена 3', order_index=1)
        
        scenes = get_project_scenes(self.project)
        self.assertEqual(len(scenes), 3)
        self.assertEqual(scenes[0].order_index, 0)
        self.assertEqual(scenes[1].order_index, 1)
        self.assertEqual(scenes[2].order_index, 2)
