from django.test import TestCase
from django.contrib.auth import get_user_model
from apps.projects.models import Project
from apps.scenes.models import Scene
from .models import Element
from .services import (
    create_element,
    update_element,
    toggle_favorite,
    delete_element,
    get_scene_elements,
    get_favorite_elements
)

User = get_user_model()


class ElementModelTest(TestCase):
    """Тесты для модели Element."""
    
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
        self.scene = Scene.objects.create(
            project=self.project,
            name='Тестовая сцена',
            order_index=0
        )
    
    def test_create_element_image(self):
        element = Element.objects.create(
            project=self.project,
            scene=self.scene,
            element_type=Element.ELEMENT_TYPE_IMAGE,
            file_url='https://example.com/image.jpg',
            prompt_text='Test prompt'
        )
        self.assertEqual(element.element_type, Element.ELEMENT_TYPE_IMAGE)
        self.assertEqual(element.scene, self.scene)
        self.assertFalse(element.is_favorite)
        self.assertIsNotNone(element.created_at)
    
    def test_create_element_video(self):
        element = Element.objects.create(
            project=self.project,
            scene=self.scene,
            element_type=Element.ELEMENT_TYPE_VIDEO,
            file_url='https://example.com/video.mp4'
        )
        self.assertEqual(element.element_type, Element.ELEMENT_TYPE_VIDEO)
    
    def test_element_str(self):
        element = Element.objects.create(
            project=self.project,
            scene=self.scene,
            element_type=Element.ELEMENT_TYPE_IMAGE
        )
        expected_str = f'IMAGE - {self.scene.name} - {element.id}'
        self.assertEqual(str(element), expected_str)
    
    def test_element_ordering(self):
        element1 = Element.objects.create(project=self.project, scene=self.scene, element_type=Element.ELEMENT_TYPE_IMAGE, order_index=1)
        element2 = Element.objects.create(project=self.project, scene=self.scene, element_type=Element.ELEMENT_TYPE_VIDEO, order_index=0)
        
        elements = Element.objects.all()
        self.assertEqual(elements[0], element2)
        self.assertEqual(elements[1], element1)
    
    def test_element_related_name(self):
        Element.objects.create(project=self.project, scene=self.scene, element_type=Element.ELEMENT_TYPE_IMAGE)
        Element.objects.create(project=self.project, scene=self.scene, element_type=Element.ELEMENT_TYPE_VIDEO)
        
        self.assertEqual(self.scene.elements.count(), 2)
    
    def test_element_type_choices(self):
        element = Element.objects.create(
            project=self.project,
            scene=self.scene,
            element_type=Element.ELEMENT_TYPE_IMAGE
        )
        self.assertEqual(element.get_element_type_display(), 'Изображение')


class ElementServiceTest(TestCase):
    """Тесты для сервисов работы с элементами."""
    
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
        self.scene = Scene.objects.create(
            project=self.project,
            name='Тестовая сцена',
            order_index=0
        )
    
    def test_create_element_service(self):
        element = create_element(
            scene=self.scene,
            element_type=Element.ELEMENT_TYPE_IMAGE,
            file_url='https://example.com/image.jpg',
            prompt_text='Test prompt'
        )
        self.assertEqual(element.element_type, Element.ELEMENT_TYPE_IMAGE)
        self.assertEqual(element.file_url, 'https://example.com/image.jpg')
        self.assertEqual(element.prompt_text, 'Test prompt')
    
    def test_update_element_service(self):
        element = create_element(scene=self.scene, element_type=Element.ELEMENT_TYPE_IMAGE)
        updated_element = update_element(
            element,
            file_url='https://example.com/new.jpg',
            is_favorite=True
        )
        self.assertEqual(updated_element.file_url, 'https://example.com/new.jpg')
        self.assertTrue(updated_element.is_favorite)
    
    def test_toggle_favorite_service(self):
        element = create_element(scene=self.scene, element_type=Element.ELEMENT_TYPE_IMAGE)
        self.assertFalse(element.is_favorite)
        
        toggled_element = toggle_favorite(element)
        self.assertTrue(toggled_element.is_favorite)
        
        toggled_element = toggle_favorite(element)
        self.assertFalse(toggled_element.is_favorite)
    
    def test_delete_element_service(self):
        element = create_element(scene=self.scene, element_type=Element.ELEMENT_TYPE_IMAGE)
        element_id = element.id
        delete_element(element)
        
        with self.assertRaises(Element.DoesNotExist):
            Element.objects.get(id=element_id)
    
    def test_get_scene_elements_service(self):
        create_element(scene=self.scene, element_type=Element.ELEMENT_TYPE_IMAGE)
        create_element(scene=self.scene, element_type=Element.ELEMENT_TYPE_VIDEO)
        create_element(scene=self.scene, element_type=Element.ELEMENT_TYPE_IMAGE)
        
        elements = get_scene_elements(self.scene)
        self.assertEqual(len(elements), 3)
    
    def test_get_scene_elements_filtered_service(self):
        create_element(scene=self.scene, element_type=Element.ELEMENT_TYPE_IMAGE)
        create_element(scene=self.scene, element_type=Element.ELEMENT_TYPE_VIDEO)
        create_element(scene=self.scene, element_type=Element.ELEMENT_TYPE_IMAGE)
        
        images = get_scene_elements(self.scene, element_type=Element.ELEMENT_TYPE_IMAGE)
        videos = get_scene_elements(self.scene, element_type=Element.ELEMENT_TYPE_VIDEO)
        
        self.assertEqual(len(images), 2)
        self.assertEqual(len(videos), 1)
    
    def test_get_favorite_elements_service(self):
        create_element(scene=self.scene, element_type=Element.ELEMENT_TYPE_IMAGE, is_favorite=True)
        create_element(scene=self.scene, element_type=Element.ELEMENT_TYPE_VIDEO, is_favorite=False)
        create_element(scene=self.scene, element_type=Element.ELEMENT_TYPE_IMAGE, is_favorite=True)
        
        favorites = get_favorite_elements(self.scene)
        self.assertEqual(len(favorites), 2)
