from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from apps.projects.models import Project
from apps.scenes.models import Scene
from .models import SharedLink, Comment
from .services import (
    create_shared_link,
)

User = get_user_model()


class SharedLinkModelTest(TestCase):
    """Тесты для модели SharedLink."""
    
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
    
    def test_create_shared_link(self):
        link = SharedLink.objects.create(project=self.project)
        self.assertIsNotNone(link.token)
        self.assertIsNone(link.expires_at)
    
    def test_shared_link_with_expiry(self):
        expires = timezone.now() + timedelta(days=7)
        link = SharedLink.objects.create(
            project=self.project,
            expires_at=expires
        )
        self.assertIsNotNone(link.expires_at)
        self.assertFalse(link.is_expired())
    
    def test_is_expired(self):
        expires = timezone.now() - timedelta(days=1)
        link = SharedLink.objects.create(
            project=self.project,
            expires_at=expires
        )
        self.assertTrue(link.is_expired())
        
        link2 = SharedLink.objects.create(project=self.project)
        self.assertFalse(link2.is_expired())
    
    def test_shared_link_str(self):
        link = SharedLink.objects.create(project=self.project)
        self.assertIn(self.project.name, str(link))
        self.assertIn('бессрочная', str(link))
    
    def test_related_name(self):
        SharedLink.objects.create(project=self.project)
        SharedLink.objects.create(project=self.project)
        
        self.assertEqual(self.project.shared_links.count(), 2)


class CommentModelTest(TestCase):
    """Тесты для модели Comment."""
    
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
    
    def test_create_comment(self):
        comment = Comment.objects.create(
            scene=self.scene,
            author_name='Клиент',
            text='Отличная работа!'
        )
        self.assertEqual(comment.author_name, 'Клиент')
        self.assertFalse(comment.is_read)
    
    def test_comment_str(self):
        comment = Comment.objects.create(
            scene=self.scene,
            author_name='Иван',
            text='Тестовый комментарий'
        )
        self.assertIn('Иван', str(comment))
        self.assertIn('✗', str(comment))
        
        comment.is_read = True
        comment.save()
        self.assertIn('✓', str(comment))
    
    def test_comment_ordering(self):
        comment1 = Comment.objects.create(
            scene=self.scene,
            author_name='Автор 1',
            text='Первый'
        )
        comment2 = Comment.objects.create(
            scene=self.scene,
            author_name='Автор 2',
            text='Второй'
        )
        
        comments = Comment.objects.all()
        self.assertEqual(comments[0], comment2)
        self.assertEqual(comments[1], comment1)
    
    def test_related_name(self):
        Comment.objects.create(scene=self.scene, author_name='A', text='1')
        Comment.objects.create(scene=self.scene, author_name='B', text='2')
        
        self.assertEqual(self.scene.comments.count(), 2)


class SharedLinkServiceTest(TestCase):
    """Тесты для сервисов публичных ссылок."""
    
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
    
    def test_create_shared_link_service(self):
        link = create_shared_link(self.project)
        self.assertIsNotNone(link.token)
        self.assertIsNone(link.expires_at)
    
    def test_create_shared_link_with_expiry(self):
        link = create_shared_link(self.project, expires_in_days=7)
        self.assertIsNotNone(link.expires_at)
    
    def test_revoke_shared_link(self):
        link = create_shared_link(self.project)
        link_id = link.id
        revoke_shared_link(link)
        
        with self.assertRaises(SharedLink.DoesNotExist):
            SharedLink.objects.get(id=link_id)
    
    def test_get_project_by_token(self):
        link = create_shared_link(self.project)
        
        project = get_project_by_token(str(link.token))
        self.assertEqual(project, self.project)
    
    def test_get_project_by_expired_token(self):
        link = create_shared_link(self.project, expires_in_days=-1)
        
        project = get_project_by_token(str(link.token))
        self.assertIsNone(project)
    
    def test_get_active_links(self):
        create_shared_link(self.project)
        create_shared_link(self.project, expires_in_days=7)
        create_shared_link(self.project, expires_in_days=-1)
        
        active = get_active_links(self.project)
        self.assertEqual(len(active), 2)


class CommentServiceTest(TestCase):
    """Тесты для сервисов комментариев."""
    
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
    
    def test_create_comment_service(self):
        comment = create_comment(
            scene=self.scene,
            author_name='Клиент',
            text='Отличная работа!'
        )
        self.assertEqual(comment.author_name, 'Клиент')
        self.assertFalse(comment.is_read)
    
    def test_mark_comment_as_read(self):
        comment = create_comment(self.scene, 'Автор', 'Текст')
        self.assertFalse(comment.is_read)
        
        updated = mark_comment_as_read(comment)
        self.assertTrue(updated.is_read)
    
    def test_get_scene_comments(self):
        create_comment(self.scene, 'A', '1')
        create_comment(self.scene, 'B', '2')
        
        comments = get_scene_comments(self.scene)
        self.assertEqual(len(comments), 2)
    
    def test_get_scene_comments_unread_only(self):
        comment1 = create_comment(self.scene, 'A', '1')
        create_comment(self.scene, 'B', '2')
        mark_comment_as_read(comment1)
        
        unread = get_scene_comments(self.scene, unread_only=True)
        self.assertEqual(len(unread), 1)
    
    def test_get_project_comments(self):
        scene2 = Scene.objects.create(
            project=self.project,
            name='Сцена 2',
            order_index=1
        )
        
        create_comment(self.scene, 'A', '1')
        create_comment(scene2, 'B', '2')
        
        comments = get_project_comments(self.project)
        self.assertEqual(len(comments), 2)
    
    def test_get_unread_count(self):
        comment1 = create_comment(self.scene, 'A', '1')
        create_comment(self.scene, 'B', '2')
        create_comment(self.scene, 'C', '3')
        mark_comment_as_read(comment1)
        
        count = get_unread_count(self.project)
        self.assertEqual(count, 2)
