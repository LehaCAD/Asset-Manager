import os
from decimal import Decimal

from django.db import IntegrityError
from django.test import TestCase

from apps.ai_services.models import AIService, LLMProvider


class LLMProviderModelTests(TestCase):
    def test_create_provider(self):
        provider = LLMProvider.objects.create(
            name="OpenAI",
            provider_type="openai_compatible",
            api_base_url="https://api.openai.com/v1",
            api_key="sk-test-key",
        )
        self.assertEqual(str(provider), "OpenAI")
        self.assertTrue(provider.is_active)
        self.assertIsNotNone(provider.created_at)

    def test_resolve_api_key_plain(self):
        provider = LLMProvider(api_key="sk-plain-key-123")
        self.assertEqual(provider.resolve_api_key(), "sk-plain-key-123")

    def test_resolve_api_key_env(self):
        os.environ["TEST_AI_KEY"] = "sk-from-env-456"
        try:
            provider = LLMProvider(api_key="ENV:TEST_AI_KEY")
            self.assertEqual(provider.resolve_api_key(), "sk-from-env-456")
        finally:
            del os.environ["TEST_AI_KEY"]

    def test_resolve_api_key_env_missing(self):
        provider = LLMProvider(api_key="ENV:NONEXISTENT_KEY_XYZ")
        with self.assertRaises(ValueError):
            provider.resolve_api_key()


class AIServiceModelTests(TestCase):
    def setUp(self):
        # Deactivate any seed services to avoid unique constraint conflicts
        AIService.objects.filter(is_active=True).update(is_active=False)

        self.provider = LLMProvider.objects.create(
            name="Test Provider",
            provider_type="openai_compatible",
            api_base_url="https://api.example.com/v1",
            api_key="sk-test",
        )

    def test_create_service(self):
        service = AIService.objects.create(
            service_type=AIService.PROMPT_ENHANCE,
            name="Prompt Enhancer",
            provider=self.provider,
            model_name="gpt-4o-mini",
            system_prompt="You enhance prompts.",
            cost_per_call=Decimal("0.50"),
        )
        self.assertEqual(str(service), "Prompt Enhancer (gpt-4o-mini)")
        self.assertTrue(service.is_active)
        self.assertIsNotNone(service.created_at)

    def test_unique_active_constraint(self):
        AIService.objects.create(
            service_type=AIService.PROMPT_ENHANCE,
            name="Enhancer 1",
            provider=self.provider,
            model_name="gpt-4o-mini",
            system_prompt="Prompt 1",
            cost_per_call=Decimal("0.50"),
            is_active=True,
        )
        with self.assertRaises(IntegrityError):
            AIService.objects.create(
                service_type=AIService.PROMPT_ENHANCE,
                name="Enhancer 2",
                provider=self.provider,
                model_name="gpt-4o",
                system_prompt="Prompt 2",
                cost_per_call=Decimal("1.00"),
                is_active=True,
            )

    def test_two_active_different_types_ok(self):
        AIService.objects.create(
            service_type=AIService.PROMPT_ENHANCE,
            name="Enhancer",
            provider=self.provider,
            model_name="gpt-4o-mini",
            system_prompt="Enhance.",
            cost_per_call=Decimal("0.50"),
            is_active=True,
        )
        service2 = AIService.objects.create(
            service_type=AIService.SMART_EDIT,
            name="Smart Editor",
            provider=self.provider,
            model_name="gpt-4o",
            system_prompt="Edit.",
            cost_per_call=Decimal("1.00"),
            is_active=True,
        )
        self.assertTrue(service2.is_active)

    def test_inactive_duplicate_allowed(self):
        AIService.objects.create(
            service_type=AIService.PROMPT_ENHANCE,
            name="Enhancer Active",
            provider=self.provider,
            model_name="gpt-4o-mini",
            system_prompt="Active.",
            cost_per_call=Decimal("0.50"),
            is_active=True,
        )
        service2 = AIService.objects.create(
            service_type=AIService.PROMPT_ENHANCE,
            name="Enhancer Inactive",
            provider=self.provider,
            model_name="gpt-4o",
            system_prompt="Inactive.",
            cost_per_call=Decimal("1.00"),
            is_active=False,
        )
        self.assertFalse(service2.is_active)

    def test_get_timeout_default(self):
        service = AIService(parameters={})
        self.assertEqual(service.get_timeout(), 15)

    def test_get_timeout_custom(self):
        service = AIService(parameters={"timeout": 30})
        self.assertEqual(service.get_timeout(), 30)
