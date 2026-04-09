"""Tests for the prompt enhancement service."""

import json
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from apps.ai_services.models import AIService, LLMProvider
from apps.ai_services.services.prompt_enhance import enhance_prompt, EnhanceResult
from apps.credits.models import CreditsTransaction
from apps.subscriptions.models import Feature, Plan
from apps.users.models import User


class PromptEnhanceTestBase(TestCase):
    """Shared setup for prompt enhancement tests."""

    def setUp(self):
        # Plan with ai_prompt feature — use get_or_create because
        # migrations may have seeded the feature/plan already.
        self.feature, _ = Feature.objects.get_or_create(
            code="ai_prompt",
            defaults={"title": "AI Prompt Enhancement"},
        )
        self.plan, _ = Plan.objects.get_or_create(
            code="test_pro",
            defaults={"name": "Test Pro", "is_default": True},
        )
        # Ensure this plan is the default
        Plan.objects.exclude(pk=self.plan.pk).update(is_default=False)
        self.plan.is_default = True
        self.plan.save()
        self.plan.features.add(self.feature)

        # User with balance
        self.user = User.objects.create_user(
            username="testuser", password="testpass",
        )
        self.user.balance = Decimal("100.00")
        self.user.save(update_fields=["balance"])

        # Deactivate any seed services to avoid unique constraint violation
        AIService.objects.filter(
            service_type=AIService.PROMPT_ENHANCE, is_active=True,
        ).update(is_active=False)

        # LLM Provider
        self.provider = LLMProvider.objects.create(
            name="Test Provider",
            provider_type=LLMProvider.OPENAI_COMPATIBLE,
            api_base_url="https://api.example.com",
            api_key="sk-test",
        )

        # Active AI Service
        self.service = AIService.objects.create(
            service_type=AIService.PROMPT_ENHANCE,
            name="Prompt Enhancer",
            provider=self.provider,
            model_name="gpt-4o-mini",
            system_prompt="You enhance prompts.",
            cost_per_call=Decimal("1.00"),
            is_active=True,
        )


class EnhancePromptSuccessTests(PromptEnhanceTestBase):
    """Tests for successful prompt enhancement."""

    @patch("apps.ai_services.services.prompt_enhance._call_llm")
    def test_enhancement_success(self, mock_llm):
        """Enhanced prompt returned when LLM returns valid JSON."""
        mock_llm.return_value = json.dumps({
            "enhanced_prompt": "A detailed cinematic scene of a sunset",
        })

        result = enhance_prompt("sunset", self.user)

        self.assertIsInstance(result, EnhanceResult)
        self.assertTrue(result.was_enhanced)
        self.assertEqual(result.prompt, "A detailed cinematic scene of a sunset")
        self.assertEqual(result.cost, Decimal("1.00"))

    @patch("apps.ai_services.services.prompt_enhance._call_llm")
    def test_credits_debited_on_success(self, mock_llm):
        """User balance decreases by cost_per_call on successful enhancement."""
        mock_llm.return_value = json.dumps({
            "enhanced_prompt": "enhanced text",
        })

        enhance_prompt("original", self.user)

        self.user.refresh_from_db()
        self.assertEqual(self.user.balance, Decimal("99.00"))

    @patch("apps.ai_services.services.prompt_enhance._call_llm")
    def test_transaction_created(self, mock_llm):
        """CreditsTransaction with REASON_PROMPT_ENHANCEMENT is created."""
        mock_llm.return_value = json.dumps({
            "enhanced_prompt": "enhanced text",
        })

        enhance_prompt("original", self.user)

        txn = CreditsTransaction.objects.filter(
            user=self.user,
            reason=CreditsTransaction.REASON_PROMPT_ENHANCEMENT,
        )
        self.assertEqual(txn.count(), 1)
        self.assertEqual(txn.first().amount, Decimal("-1.00"))

    @patch("apps.ai_services.services.prompt_enhance._call_llm")
    def test_llm_returns_json_with_enhanced_prompt(self, mock_llm):
        """Valid JSON with enhanced_prompt key is parsed correctly."""
        mock_llm.return_value = json.dumps({
            "enhanced_prompt": "A majestic golden dragon soaring through clouds",
        })

        result = enhance_prompt("dragon", self.user)

        self.assertTrue(result.was_enhanced)
        self.assertEqual(
            result.prompt,
            "A majestic golden dragon soaring through clouds",
        )

    @patch("apps.ai_services.services.prompt_enhance._call_llm")
    def test_llm_returns_plain_text(self, mock_llm):
        """Plain text (non-JSON) response is used as-is."""
        mock_llm.return_value = "A beautiful sunset over the ocean with warm colors"

        result = enhance_prompt("sunset", self.user)

        self.assertTrue(result.was_enhanced)
        self.assertEqual(
            result.prompt,
            "A beautiful sunset over the ocean with warm colors",
        )


class EnhancePromptNoopTests(PromptEnhanceTestBase):
    """Tests for cases that return original prompt unchanged."""

    def test_no_active_service_returns_original(self):
        """When no active service exists, original prompt is returned."""
        self.service.is_active = False
        self.service.save()

        result = enhance_prompt("my prompt", self.user)

        self.assertFalse(result.was_enhanced)
        self.assertEqual(result.prompt, "my prompt")
        self.assertEqual(result.cost, Decimal("0"))

    @patch("apps.subscriptions.services.SubscriptionService.has_feature")
    def test_no_feature_returns_original(self, mock_has_feature):
        """When user lacks ai_prompt feature, original prompt is returned."""
        mock_has_feature.return_value = False

        result = enhance_prompt("my prompt", self.user)

        self.assertFalse(result.was_enhanced)
        self.assertEqual(result.prompt, "my prompt")
        self.assertEqual(result.cost, Decimal("0"))

    @patch("apps.ai_services.services.prompt_enhance._call_llm")
    def test_llm_error_returns_original(self, mock_llm):
        """When LLM call raises exception, original prompt is returned."""
        mock_llm.side_effect = Exception("Connection timeout")

        result = enhance_prompt("my prompt", self.user)

        self.assertFalse(result.was_enhanced)
        self.assertEqual(result.prompt, "my prompt")
        self.assertEqual(result.cost, Decimal("0"))

    @patch("apps.ai_services.services.prompt_enhance._call_llm")
    def test_llm_error_no_debit(self, mock_llm):
        """When LLM call fails, balance stays unchanged."""
        mock_llm.side_effect = Exception("API error")

        enhance_prompt("my prompt", self.user)

        self.user.refresh_from_db()
        self.assertEqual(self.user.balance, Decimal("100.00"))

    @patch("apps.ai_services.services.prompt_enhance._call_llm")
    def test_llm_returns_empty_uses_original(self, mock_llm):
        """When LLM returns empty string, original prompt is returned."""
        mock_llm.return_value = ""

        result = enhance_prompt("my prompt", self.user)

        self.assertFalse(result.was_enhanced)
        self.assertEqual(result.prompt, "my prompt")
        self.assertEqual(result.cost, Decimal("0"))

    @patch("apps.ai_services.services.prompt_enhance._call_llm")
    def test_insufficient_credits_skips_llm(self, mock_llm):
        """When balance < cost, LLM is never called."""
        self.user.balance = Decimal("0.50")
        self.user.save(update_fields=["balance"])

        result = enhance_prompt("my prompt", self.user)

        self.assertFalse(result.was_enhanced)
        self.assertEqual(result.prompt, "my prompt")
        self.assertEqual(result.cost, Decimal("0"))
        mock_llm.assert_not_called()
