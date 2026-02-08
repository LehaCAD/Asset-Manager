from django.test import TestCase
from .models import AIProvider, AIModel
from .services import (
    create_provider,
    create_model,
    get_active_providers,
    get_active_models,
    get_provider_models,
    build_request_from_schema
)


class AIProviderModelTest(TestCase):
    """Тесты для модели AIProvider."""
    
    def test_create_provider(self):
        """Тест создания провайдера."""
        provider = AIProvider.objects.create(
            name='Kie.ai',
            base_url='https://api.kie.ai',
            api_key='test_key',
            is_active=True
        )
        self.assertEqual(provider.name, 'Kie.ai')
        self.assertEqual(provider.base_url, 'https://api.kie.ai')
        self.assertTrue(provider.is_active)
    
    def test_provider_str(self):
        """Тест строкового представления провайдера."""
        provider = AIProvider.objects.create(
            name='Test Provider',
            base_url='https://test.com',
            is_active=True
        )
        self.assertEqual(str(provider), '✓ Test Provider')
        
        provider.is_active = False
        provider.save()
        self.assertEqual(str(provider), '✗ Test Provider')
    
    def test_provider_ordering(self):
        """Тест сортировки провайдеров по имени."""
        provider1 = AIProvider.objects.create(name='Zebra', base_url='https://z.com')
        provider2 = AIProvider.objects.create(name='Alpha', base_url='https://a.com')
        
        providers = AIProvider.objects.all()
        self.assertEqual(providers[0], provider2)
        self.assertEqual(providers[1], provider1)


class AIModelModelTest(TestCase):
    """Тесты для модели AIModel."""
    
    def setUp(self):
        """Создание тестового провайдера."""
        self.provider = AIProvider.objects.create(
            name='Kie.ai',
            base_url='https://api.kie.ai',
            is_active=True
        )
    
    def test_create_model(self):
        """Тест создания модели."""
        model = AIModel.objects.create(
            provider=self.provider,
            name='Nano Banana',
            model_type=AIModel.MODEL_TYPE_IMAGE,
            api_endpoint='/nano-banana',
            request_schema={'prompt': '{{prompt}}'},
            parameters_schema={'width': {'type': 'select', 'options': [512, 1024]}}
        )
        self.assertEqual(model.name, 'Nano Banana')
        self.assertEqual(model.model_type, AIModel.MODEL_TYPE_IMAGE)
    
    def test_model_str(self):
        """Тест строкового представления модели."""
        model = AIModel.objects.create(
            provider=self.provider,
            name='Test Model',
            model_type=AIModel.MODEL_TYPE_IMAGE,
            api_endpoint='/test',
            is_active=True
        )
        expected_str = '✓ Test Model (Изображение) - Kie.ai'
        self.assertEqual(str(model), expected_str)
    
    def test_get_full_url(self):
        """Тест получения полного URL."""
        model = AIModel.objects.create(
            provider=self.provider,
            name='Test Model',
            model_type=AIModel.MODEL_TYPE_IMAGE,
            api_endpoint='/v1/generate'
        )
        self.assertEqual(model.get_full_url(), 'https://api.kie.ai/v1/generate')
        
        # Тест с trailing slash
        model.api_endpoint = 'generate'
        self.assertEqual(model.get_full_url(), 'https://api.kie.ai/generate')
    
    def test_model_related_name(self):
        """Тест обратной связи через related_name."""
        AIModel.objects.create(
            provider=self.provider,
            name='Model 1',
            model_type=AIModel.MODEL_TYPE_IMAGE,
            api_endpoint='/m1'
        )
        AIModel.objects.create(
            provider=self.provider,
            name='Model 2',
            model_type=AIModel.MODEL_TYPE_VIDEO,
            api_endpoint='/m2'
        )
        
        self.assertEqual(self.provider.models.count(), 2)


class AIProviderServiceTest(TestCase):
    """Тесты для сервисов AI провайдеров."""
    
    def test_create_provider_service(self):
        """Тест создания провайдера через сервис."""
        provider = create_provider(
            name='OpenAI',
            base_url='https://api.openai.com',
            api_key='sk-test',
            is_active=True
        )
        self.assertEqual(provider.name, 'OpenAI')
        self.assertTrue(provider.is_active)
    
    def test_get_active_providers(self):
        """Тест получения активных провайдеров."""
        create_provider('Active', 'https://active.com', is_active=True)
        create_provider('Inactive', 'https://inactive.com', is_active=False)
        
        active = get_active_providers()
        self.assertEqual(len(active), 1)
        self.assertEqual(active[0].name, 'Active')


class AIModelServiceTest(TestCase):
    """Тесты для сервисов AI моделей."""
    
    def setUp(self):
        """Создание тестового провайдера."""
        self.provider = create_provider(
            name='Kie.ai',
            base_url='https://api.kie.ai',
            is_active=True
        )
    
    def test_create_model_service(self):
        """Тест создания модели через сервис."""
        model = create_model(
            provider=self.provider,
            name='Nano Banana',
            model_type=AIModel.MODEL_TYPE_IMAGE,
            api_endpoint='/nano-banana',
            request_schema={'prompt': '{{prompt}}', 'width': '{{width}}'},
            parameters_schema={
                'width': {'type': 'select', 'options': [512, 1024], 'default': 1024}
            }
        )
        self.assertEqual(model.name, 'Nano Banana')
        self.assertIn('prompt', model.request_schema)
        self.assertIn('width', model.parameters_schema)
    
    def test_get_active_models(self):
        """Тест получения активных моделей."""
        create_model(
            self.provider, 'Active Image', AIModel.MODEL_TYPE_IMAGE, '/img', is_active=True
        )
        create_model(
            self.provider, 'Inactive Video', AIModel.MODEL_TYPE_VIDEO, '/vid', is_active=False
        )
        
        active = get_active_models()
        self.assertEqual(len(active), 1)
        self.assertEqual(active[0].name, 'Active Image')
    
    def test_get_active_models_filtered(self):
        """Тест получения активных моделей с фильтром."""
        create_model(
            self.provider, 'Image 1', AIModel.MODEL_TYPE_IMAGE, '/img1', is_active=True
        )
        create_model(
            self.provider, 'Video 1', AIModel.MODEL_TYPE_VIDEO, '/vid1', is_active=True
        )
        
        images = get_active_models(model_type=AIModel.MODEL_TYPE_IMAGE)
        videos = get_active_models(model_type=AIModel.MODEL_TYPE_VIDEO)
        
        self.assertEqual(len(images), 1)
        self.assertEqual(len(videos), 1)
    
    def test_get_provider_models(self):
        """Тест получения всех моделей провайдера."""
        create_model(self.provider, 'Model 1', AIModel.MODEL_TYPE_IMAGE, '/m1')
        create_model(self.provider, 'Model 2', AIModel.MODEL_TYPE_VIDEO, '/m2')
        
        models = get_provider_models(self.provider)
        self.assertEqual(len(models), 2)
    
    def test_build_request_from_schema(self):
        """Тест построения запроса из схемы."""
        model = create_model(
            self.provider,
            'Test Model',
            AIModel.MODEL_TYPE_IMAGE,
            '/test',
            request_schema={
                'prompt': '{{prompt}}',
                'width': '{{width}}',
                'height': '{{height}}',
                'steps': '{{steps}}'
            }
        )
        
        parameters = {
            'prompt': 'A beautiful sunset',
            'width': 1024,
            'height': 768,
            'steps': 30
        }
        
        request = build_request_from_schema(model, parameters)
        
        self.assertEqual(request['prompt'], 'A beautiful sunset')
        self.assertEqual(request['width'], 1024)
        self.assertEqual(request['height'], 768)
        self.assertEqual(request['steps'], 30)
