from django.test import TestCase
from django.contrib.auth import get_user_model
from apps.projects.models import Project
from .models import Box
from .services import create_box, update_box, reorder_boxes, delete_box, get_project_boxes

User = get_user_model()


class BoxModelTest(TestCase):
    """Тесты для модели Box."""
    
    def setUp(self):
        """Создание тестовых данных."""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.project = Project.objects.create(
            user=self.user,
            name='Тестовый проект'
        )
    
    def test_create_box(self):
        """Тест создания бокса."""
        box = Box.objects.create(
            project=self.project,
            name='Тестовый бокс',
            order_index=0
        )
        self.assertEqual(box.name, 'Тестовый бокс')
        self.assertEqual(box.project, self.project)
        self.assertEqual(box.order_index, 0)
        self.assertIsNotNone(box.created_at)
        self.assertIsNotNone(box.updated_at)
    
    def test_box_str(self):
        """Тест строкового представления бокса."""
        box = Box.objects.create(
            project=self.project,
            name='Мой бокс',
            order_index=1
        )
        expected_str = f'Мой бокс (Проект: {self.project.name})'
        self.assertEqual(str(box), expected_str)
    
    def test_box_ordering(self):
        """Тест сортировки боксов по order_index."""
        box1 = Box.objects.create(project=self.project, name='Бокс 1', order_index=2)
        box2 = Box.objects.create(project=self.project, name='Бокс 2', order_index=0)
        box3 = Box.objects.create(project=self.project, name='Бокс 3', order_index=1)
        
        boxes = Box.objects.all()
        self.assertEqual(boxes[0], box2)  # order_index=0
        self.assertEqual(boxes[1], box3)  # order_index=1
        self.assertEqual(boxes[2], box1)  # order_index=2
    
    def test_box_related_name(self):
        """Тест обратной связи через related_name."""
        Box.objects.create(project=self.project, name='Бокс 1', order_index=0)
        Box.objects.create(project=self.project, name='Бокс 2', order_index=1)
        
        self.assertEqual(self.project.boxes.count(), 2)
        self.assertEqual(self.project.boxes.first().name, 'Бокс 1')


class BoxServiceTest(TestCase):
    """Тесты для сервисов работы с боксами."""
    
    def setUp(self):
        """Создание тестовых данных."""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.project = Project.objects.create(
            user=self.user,
            name='Тестовый проект'
        )
    
    def test_create_box_service(self):
        """Тест создания бокса через сервис."""
        box = create_box(project=self.project, name='Новый бокс', order_index=5)
        self.assertEqual(box.name, 'Новый бокс')
        self.assertEqual(box.project, self.project)
        self.assertEqual(box.order_index, 5)
    
    def test_update_box_service(self):
        """Тест обновления бокса через сервис."""
        box = create_box(project=self.project, name='Старое название')
        updated_box = update_box(box, name='Новое название', order_index=10)
        self.assertEqual(updated_box.name, 'Новое название')
        self.assertEqual(updated_box.order_index, 10)
    
    def test_reorder_boxes_service(self):
        """Тест изменения порядка боксов."""
        box1 = create_box(project=self.project, name='Бокс 1', order_index=0)
        box2 = create_box(project=self.project, name='Бокс 2', order_index=1)
        box3 = create_box(project=self.project, name='Бокс 3', order_index=2)
        
        # Меняем порядок: 3, 1, 2
        reorder_boxes([box3.id, box1.id, box2.id])
        
        box1.refresh_from_db()
        box2.refresh_from_db()
        box3.refresh_from_db()
        
        self.assertEqual(box3.order_index, 0)
        self.assertEqual(box1.order_index, 1)
        self.assertEqual(box2.order_index, 2)
    
    def test_delete_box_service(self):
        """Тест удаления бокса через сервис."""
        box = create_box(project=self.project, name='Бокс для удаления')
        box_id = box.id
        delete_box(box)
        
        with self.assertRaises(Box.DoesNotExist):
            Box.objects.get(id=box_id)
    
    def test_get_project_boxes_service(self):
        """Тест получения всех боксов проекта."""
        create_box(project=self.project, name='Бокс 1', order_index=2)
        create_box(project=self.project, name='Бокс 2', order_index=0)
        create_box(project=self.project, name='Бокс 3', order_index=1)
        
        boxes = get_project_boxes(self.project)
        self.assertEqual(len(boxes), 3)
        self.assertEqual(boxes[0].order_index, 0)
        self.assertEqual(boxes[1].order_index, 1)
        self.assertEqual(boxes[2].order_index, 2)
