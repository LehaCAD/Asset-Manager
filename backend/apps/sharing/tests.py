from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from apps.projects.models import Project
from apps.boxes.models import Box
from .models import SharedLink, Comment
from .services import (
    create_shared_link,
    revoke_shared_link,
    get_project_by_token,
    get_active_links,
    create_comment,
    mark_comment_as_read,
    get_box_comments,
    get_project_comments,
    get_unread_count
)

User = get_user_model()


class SharedLinkModelTest(TestCase):
    """Тесты для модели SharedLink."""
    
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
    
    def test_create_shared_link(self):
        """Тест создания публичной ссылки."""
        link = SharedLink.objects.create(project=self.project)
        self.assertIsNotNone(link.token)
        self.assertIsNone(link.expires_at)
    
    def test_shared_link_with_expiry(self):
        """Тест ссылки со сроком действия."""
        expires = timezone.now() + timedelta(days=7)
        link = SharedLink.objects.create(
            project=self.project,
            expires_at=expires
        )
        self.assertIsNotNone(link.expires_at)
        self.assertFalse(link.is_expired())
    
    def test_is_expired(self):
        """Тест проверки истечения срока."""
        # Истекшая ссылка
        expires = timezone.now() - timedelta(days=1)
        link = SharedLink.objects.create(
            project=self.project,
            expires_at=expires
        )
        self.assertTrue(link.is_expired())
        
        # Бессрочная ссылка
        link2 = SharedLink.objects.create(project=self.project)
        self.assertFalse(link2.is_expired())
    
    def test_shared_link_str(self):
        """Тест строкового представления."""
        link = SharedLink.objects.create(project=self.project)
        self.assertIn(self.project.name, str(link))
        self.assertIn('бессрочная', str(link))
    
    def test_related_name(self):
        """Тест обратной связи через related_name."""
        SharedLink.objects.create(project=self.project)
        SharedLink.objects.create(project=self.project)
        
        self.assertEqual(self.project.shared_links.count(), 2)


class CommentModelTest(TestCase):
    """Тесты для модели Comment."""
    
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
        self.box = Box.objects.create(
            project=self.project,
            name='Тестовый бокс',
            order_index=0
        )
    
    def test_create_comment(self):
        """Тест создания комментария."""
        comment = Comment.objects.create(
            box=self.box,
            author_name='Клиент',
            text='Отличная работа!'
        )
        self.assertEqual(comment.author_name, 'Клиент')
        self.assertFalse(comment.is_read)
    
    def test_comment_str(self):
        """Тест строкового представления."""
        comment = Comment.objects.create(
            box=self.box,
            author_name='Иван',
            text='Тестовый комментарий'
        )
        self.assertIn('Иван', str(comment))
        self.assertIn('✗', str(comment))  # Непрочитанный
        
        comment.is_read = True
        comment.save()
        self.assertIn('✓', str(comment))  # Прочитанный
    
    def test_comment_ordering(self):
        """Тест сортировки комментариев."""
        comment1 = Comment.objects.create(
            box=self.box,
            author_name='Автор 1',
            text='Первый'
        )
        comment2 = Comment.objects.create(
            box=self.box,
            author_name='Автор 2',
            text='Второй'
        )
        
        comments = Comment.objects.all()
        self.assertEqual(comments[0], comment2)  # Новый первым
        self.assertEqual(comments[1], comment1)
    
    def test_related_name(self):
        """Тест обратной связи через related_name."""
        Comment.objects.create(box=self.box, author_name='A', text='1')
        Comment.objects.create(box=self.box, author_name='B', text='2')
        
        self.assertEqual(self.box.comments.count(), 2)


class SharedLinkServiceTest(TestCase):
    """Тесты для сервисов публичных ссылок."""
    
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
    
    def test_create_shared_link_service(self):
        """Тест создания ссылки через сервис."""
        link = create_shared_link(self.project)
        self.assertIsNotNone(link.token)
        self.assertIsNone(link.expires_at)
    
    def test_create_shared_link_with_expiry(self):
        """Тест создания ссылки со сроком."""
        link = create_shared_link(self.project, expires_in_days=7)
        self.assertIsNotNone(link.expires_at)
    
    def test_revoke_shared_link(self):
        """Тест отзыва ссылки."""
        link = create_shared_link(self.project)
        link_id = link.id
        revoke_shared_link(link)
        
        with self.assertRaises(SharedLink.DoesNotExist):
            SharedLink.objects.get(id=link_id)
    
    def test_get_project_by_token(self):
        """Тест получения проекта по токену."""
        link = create_shared_link(self.project)
        
        project = get_project_by_token(str(link.token))
        self.assertEqual(project, self.project)
    
    def test_get_project_by_expired_token(self):
        """Тест получения проекта по истекшему токену."""
        link = create_shared_link(self.project, expires_in_days=-1)
        
        project = get_project_by_token(str(link.token))
        self.assertIsNone(project)
    
    def test_get_active_links(self):
        """Тест получения активных ссылок."""
        create_shared_link(self.project)  # Бессрочная
        create_shared_link(self.project, expires_in_days=7)  # Активная
        create_shared_link(self.project, expires_in_days=-1)  # Истекшая
        
        active = get_active_links(self.project)
        self.assertEqual(len(active), 2)  # Только активные


class CommentServiceTest(TestCase):
    """Тесты для сервисов комментариев."""
    
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
        self.box = Box.objects.create(
            project=self.project,
            name='Тестовый бокс',
            order_index=0
        )
    
    def test_create_comment_service(self):
        """Тест создания комментария через сервис."""
        comment = create_comment(
            box=self.box,
            author_name='Клиент',
            text='Отличная работа!'
        )
        self.assertEqual(comment.author_name, 'Клиент')
        self.assertFalse(comment.is_read)
    
    def test_mark_comment_as_read(self):
        """Тест отметки комментария как прочитанного."""
        comment = create_comment(self.box, 'Автор', 'Текст')
        self.assertFalse(comment.is_read)
        
        updated = mark_comment_as_read(comment)
        self.assertTrue(updated.is_read)
    
    def test_get_box_comments(self):
        """Тест получения комментариев бокса."""
        create_comment(self.box, 'A', '1')
        create_comment(self.box, 'B', '2')
        
        comments = get_box_comments(self.box)
        self.assertEqual(len(comments), 2)
    
    def test_get_box_comments_unread_only(self):
        """Тест получения только непрочитанных комментариев."""
        comment1 = create_comment(self.box, 'A', '1')
        create_comment(self.box, 'B', '2')
        mark_comment_as_read(comment1)
        
        unread = get_box_comments(self.box, unread_only=True)
        self.assertEqual(len(unread), 1)
    
    def test_get_project_comments(self):
        """Тест получения комментариев проекта."""
        box2 = Box.objects.create(
            project=self.project,
            name='Бокс 2',
            order_index=1
        )
        
        create_comment(self.box, 'A', '1')
        create_comment(box2, 'B', '2')
        
        comments = get_project_comments(self.project)
        self.assertEqual(len(comments), 2)
    
    def test_get_unread_count(self):
        """Тест подсчета непрочитанных комментариев."""
        comment1 = create_comment(self.box, 'A', '1')
        create_comment(self.box, 'B', '2')
        create_comment(self.box, 'C', '3')
        mark_comment_as_read(comment1)
        
        count = get_unread_count(self.project)
        self.assertEqual(count, 2)
