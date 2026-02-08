from django.test import TestCase
from django.contrib.auth import get_user_model
from apps.projects.models import Project
from apps.boxes.models import Box
from .models import Asset
from .services import (
    create_asset,
    update_asset,
    toggle_favorite,
    delete_asset,
    get_box_assets,
    get_favorite_assets
)

User = get_user_model()


class AssetModelTest(TestCase):
    """Тесты для модели Asset."""
    
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
    
    def test_create_asset_image(self):
        """Тест создания ассета-изображения."""
        asset = Asset.objects.create(
            box=self.box,
            asset_type=Asset.ASSET_TYPE_IMAGE,
            file_url='https://example.com/image.jpg',
            prompt_text='Test prompt'
        )
        self.assertEqual(asset.asset_type, Asset.ASSET_TYPE_IMAGE)
        self.assertEqual(asset.box, self.box)
        self.assertFalse(asset.is_favorite)
        self.assertIsNotNone(asset.created_at)
    
    def test_create_asset_video(self):
        """Тест создания ассета-видео."""
        asset = Asset.objects.create(
            box=self.box,
            asset_type=Asset.ASSET_TYPE_VIDEO,
            file_url='https://example.com/video.mp4'
        )
        self.assertEqual(asset.asset_type, Asset.ASSET_TYPE_VIDEO)
    
    def test_asset_str(self):
        """Тест строкового представления ассета."""
        asset = Asset.objects.create(
            box=self.box,
            asset_type=Asset.ASSET_TYPE_IMAGE
        )
        expected_str = f'Изображение #{asset.id} (Бокс: {self.box.name})'
        self.assertEqual(str(asset), expected_str)
    
    def test_asset_ordering(self):
        """Тест сортировки ассетов по дате создания (новые первыми)."""
        asset1 = Asset.objects.create(box=self.box, asset_type=Asset.ASSET_TYPE_IMAGE)
        asset2 = Asset.objects.create(box=self.box, asset_type=Asset.ASSET_TYPE_VIDEO)
        
        assets = Asset.objects.all()
        self.assertEqual(assets[0], asset2)  # Новый ассет должен быть первым
        self.assertEqual(assets[1], asset1)
    
    def test_asset_related_name(self):
        """Тест обратной связи через related_name."""
        Asset.objects.create(box=self.box, asset_type=Asset.ASSET_TYPE_IMAGE)
        Asset.objects.create(box=self.box, asset_type=Asset.ASSET_TYPE_VIDEO)
        
        self.assertEqual(self.box.assets.count(), 2)
    
    def test_asset_choices(self):
        """Тест choices для asset_type."""
        asset = Asset.objects.create(
            box=self.box,
            asset_type=Asset.ASSET_TYPE_IMAGE
        )
        self.assertEqual(asset.get_asset_type_display(), 'Изображение')


class AssetServiceTest(TestCase):
    """Тесты для сервисов работы с ассетами."""
    
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
    
    def test_create_asset_service(self):
        """Тест создания ассета через сервис."""
        asset = create_asset(
            box=self.box,
            asset_type=Asset.ASSET_TYPE_IMAGE,
            file_url='https://example.com/image.jpg',
            prompt_text='Test prompt'
        )
        self.assertEqual(asset.asset_type, Asset.ASSET_TYPE_IMAGE)
        self.assertEqual(asset.file_url, 'https://example.com/image.jpg')
        self.assertEqual(asset.prompt_text, 'Test prompt')
    
    def test_update_asset_service(self):
        """Тест обновления ассета через сервис."""
        asset = create_asset(box=self.box, asset_type=Asset.ASSET_TYPE_IMAGE)
        updated_asset = update_asset(
            asset,
            file_url='https://example.com/new.jpg',
            is_favorite=True
        )
        self.assertEqual(updated_asset.file_url, 'https://example.com/new.jpg')
        self.assertTrue(updated_asset.is_favorite)
    
    def test_toggle_favorite_service(self):
        """Тест переключения избранного через сервис."""
        asset = create_asset(box=self.box, asset_type=Asset.ASSET_TYPE_IMAGE)
        self.assertFalse(asset.is_favorite)
        
        toggled_asset = toggle_favorite(asset)
        self.assertTrue(toggled_asset.is_favorite)
        
        toggled_asset = toggle_favorite(asset)
        self.assertFalse(toggled_asset.is_favorite)
    
    def test_delete_asset_service(self):
        """Тест удаления ассета через сервис."""
        asset = create_asset(box=self.box, asset_type=Asset.ASSET_TYPE_IMAGE)
        asset_id = asset.id
        delete_asset(asset)
        
        with self.assertRaises(Asset.DoesNotExist):
            Asset.objects.get(id=asset_id)
    
    def test_get_box_assets_service(self):
        """Тест получения всех ассетов бокса."""
        create_asset(box=self.box, asset_type=Asset.ASSET_TYPE_IMAGE)
        create_asset(box=self.box, asset_type=Asset.ASSET_TYPE_VIDEO)
        create_asset(box=self.box, asset_type=Asset.ASSET_TYPE_IMAGE)
        
        assets = get_box_assets(self.box)
        self.assertEqual(len(assets), 3)
    
    def test_get_box_assets_filtered_service(self):
        """Тест получения ассетов бокса с фильтром по типу."""
        create_asset(box=self.box, asset_type=Asset.ASSET_TYPE_IMAGE)
        create_asset(box=self.box, asset_type=Asset.ASSET_TYPE_VIDEO)
        create_asset(box=self.box, asset_type=Asset.ASSET_TYPE_IMAGE)
        
        images = get_box_assets(self.box, asset_type=Asset.ASSET_TYPE_IMAGE)
        videos = get_box_assets(self.box, asset_type=Asset.ASSET_TYPE_VIDEO)
        
        self.assertEqual(len(images), 2)
        self.assertEqual(len(videos), 1)
    
    def test_get_favorite_assets_service(self):
        """Тест получения избранных ассетов."""
        create_asset(box=self.box, asset_type=Asset.ASSET_TYPE_IMAGE, is_favorite=True)
        create_asset(box=self.box, asset_type=Asset.ASSET_TYPE_VIDEO, is_favorite=False)
        create_asset(box=self.box, asset_type=Asset.ASSET_TYPE_IMAGE, is_favorite=True)
        
        favorites = get_favorite_assets(self.box)
        self.assertEqual(len(favorites), 2)
