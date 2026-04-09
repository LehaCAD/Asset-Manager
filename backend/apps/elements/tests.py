from decimal import Decimal
from unittest.mock import patch

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


class OrchestrationEnhancePromptTests(TestCase):
    """Tests for prompt enhancement integration in create_generation."""

    def setUp(self):
        from apps.ai_providers.models import AIProvider, AIModel
        from apps.ai_services.models import LLMProvider, AIService
        from apps.subscriptions.models import Feature, Plan

        # Plan with ai_prompt feature
        self.feature, _ = Feature.objects.get_or_create(
            code="ai_prompt",
            defaults={"title": "AI Prompt Enhancement"},
        )
        self.plan, _ = Plan.objects.get_or_create(
            code="test_pro",
            defaults={"name": "Test Pro", "is_default": True},
        )
        Plan.objects.exclude(pk=self.plan.pk).update(is_default=False)
        self.plan.is_default = True
        self.plan.save()
        self.plan.features.add(self.feature)

        # User with balance
        self.user = User.objects.create_user(
            username="orch_testuser", password="testpass",
        )
        self.user.balance = Decimal("100.00")
        self.user.save(update_fields=["balance"])

        # Project and Scene
        self.project = Project.objects.create(
            user=self.user, name="Test Project",
        )
        self.scene = Scene.objects.create(
            project=self.project, name="Test Scene", order_index=0,
        )

        # AI Provider (generation provider, not LLM)
        self.ai_provider = AIProvider.objects.create(
            name="Test AI Provider",
            base_url="https://api.test-provider.com",
            api_key="test-key",
        )

        # AI Model for generation
        self.ai_model = AIModel.objects.create(
            provider=self.ai_provider,
            name="Test Model",
            model_type=AIModel.MODEL_TYPE_IMAGE,
            api_endpoint="/v1/generate",
            request_schema={"prompt": "{{prompt}}"},
            pricing_schema={"fixed_cost": "5.00"},
        )

        # LLM Provider for prompt enhancement
        self.llm_provider = LLMProvider.objects.create(
            name="Test LLM Provider",
            provider_type=LLMProvider.OPENAI_COMPATIBLE,
            api_base_url="https://api.example.com",
            api_key="sk-test",
        )

        # Active AI Service for prompt enhancement
        self.ai_service = AIService.objects.create(
            service_type=AIService.PROMPT_ENHANCE,
            name="Prompt Enhancer",
            provider=self.llm_provider,
            model_name="gpt-4o-mini",
            system_prompt="You enhance prompts.",
            cost_per_call=Decimal("1.00"),
            is_active=True,
        )

    @patch("apps.ai_services.services.prompt_enhance._call_llm")
    @patch("apps.elements.tasks.start_generation.delay")
    @patch("apps.subscriptions.services.SubscriptionService.check_storage", return_value=True)
    def test_enhance_prompt_flag_triggers_enhancement(self, mock_storage, mock_task, mock_llm):
        from .orchestration import create_generation

        mock_llm.return_value = '{"enhanced_prompt": "Enhanced: beautiful cat"}'
        data, status = create_generation(
            project=self.project, scene=self.scene,
            prompt="cat", ai_model_id=self.ai_model.id,
            generation_config={"enhance_prompt": True},
            user=self.user,
        )
        self.assertEqual(status, 201)
        element = Element.objects.get(pk=data["id"])
        self.assertEqual(element.generation_config.get("_enhanced_prompt"), "Enhanced: beautiful cat")
        self.assertTrue(element.generation_config.get("_prompt_enhanced"))
        self.assertEqual(element.prompt_text, "cat")

    @patch("apps.elements.tasks.start_generation.delay")
    @patch("apps.subscriptions.services.SubscriptionService.check_storage", return_value=True)
    def test_no_enhance_flag_skips_enhancement(self, mock_storage, mock_task):
        from .orchestration import create_generation

        data, status = create_generation(
            project=self.project, scene=self.scene,
            prompt="detailed prompt",
            ai_model_id=self.ai_model.id,
            generation_config={},
            user=self.user,
        )
        self.assertEqual(status, 201)
        element = Element.objects.get(pk=data["id"])
        self.assertNotIn("_enhanced_prompt", element.generation_config or {})

    @patch("apps.ai_services.services.prompt_enhance._call_llm")
    @patch("apps.elements.tasks.start_generation.delay")
    @patch("apps.subscriptions.services.SubscriptionService.check_storage", return_value=True)
    def test_enhance_flag_removed_from_config(self, mock_storage, mock_task, mock_llm):
        from .orchestration import create_generation

        mock_llm.return_value = '{"enhanced_prompt": "Enhanced"}'
        data, _ = create_generation(
            project=self.project, scene=self.scene,
            prompt="test", ai_model_id=self.ai_model.id,
            generation_config={"enhance_prompt": True, "aspect_ratio": "16:9"},
            user=self.user,
        )
        element = Element.objects.get(pk=data["id"])
        self.assertNotIn("enhance_prompt", element.generation_config)
        self.assertEqual(element.generation_config.get("aspect_ratio"), "16:9")
