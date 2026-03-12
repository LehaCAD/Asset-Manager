from decimal import Decimal

from django.test import SimpleTestCase, TestCase

from apps.credits.models import CreditsTransaction
from apps.credits.serializers import CreditsEstimateRequestSerializer
from apps.credits.services import CreditsService
from apps.ai_providers.models import AIModel, AIProvider, CanonicalParameter, ModelParameterBinding, ModelPricingConfig
from apps.users.models import User


class CreditsEstimateRequestSerializerTests(SimpleTestCase):
    def test_accepts_numeric_generation_values(self):
        serializer = CreditsEstimateRequestSerializer(
            data={
                "ai_model_id": 1,
                "generation_config": {"width": 1024, "height": 1024},
            }
        )

        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["generation_config"]["width"] == 1024

    def test_accepts_array_generation_values(self):
        serializer = CreditsEstimateRequestSerializer(
            data={
                "ai_model_id": 1,
                "generation_config": {"input_urls": ["https://x/1.png"]},
            }
        )

        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["generation_config"]["input_urls"] == [
            "https://x/1.png"
        ]


class CreditsServiceTopupTests(TestCase):
    def test_topup_updates_balance_and_creates_transaction(self):
        user = User.objects.create_user(username="u1", password="x")

        result = CreditsService().topup(
            user=user,
            amount=Decimal("100.00"),
            reason=CreditsTransaction.REASON_ADMIN_TOPUP,
            metadata={"source": "admin_action"},
        )

        user.refresh_from_db()
        assert user.balance == Decimal("100.00")
        assert result.balance_after == Decimal("100.00")
        assert (
            CreditsTransaction.objects.filter(
                user=user,
                reason=CreditsTransaction.REASON_ADMIN_TOPUP,
                amount=Decimal("100.00"),
            ).count()
            == 1
        )


class CreditsServiceCompiledPricingTests(TestCase):
    def test_estimate_generation_uses_compiled_pricing_payload_from_bindings(self):
        user = User.objects.create_user(username="priced-user", password="x", balance=Decimal("100.00"))
        provider = AIProvider.objects.create(name="Provider", base_url="https://example.com", is_active=True)
        model = AIModel.objects.create(
            provider=provider,
            name="Video Model",
            model_type=AIModel.MODEL_TYPE_VIDEO,
            api_endpoint="/generate",
            request_schema={"duration": "{{videoDuration}}", "resolution": "{{resolution}}"},
            pricing_schema={"fixed_cost": "999.00"},
        )
        duration = CanonicalParameter.objects.create(
            code="duration",
            ui_semantic="duration",
            value_type="enum",
            aliases=["videoDuration"],
            default_ui_control="select",
        )
        resolution = CanonicalParameter.objects.create(
            code="resolution",
            ui_semantic="resolution",
            value_type="enum",
            default_ui_control="select",
        )
        ModelParameterBinding.objects.create(
            ai_model=model,
            canonical_parameter=duration,
            placeholder="videoDuration",
            request_path="duration",
            sort_order=10,
        )
        ModelParameterBinding.objects.create(
            ai_model=model,
            canonical_parameter=resolution,
            placeholder="resolution",
            request_path="resolution",
            sort_order=20,
        )
        ModelPricingConfig.objects.create(
            ai_model=model,
            mode=ModelPricingConfig.MODE_LOOKUP,
            dimensions=["resolution", "duration"],
            raw_lookup={"720p|5": "3.00"},
        )

        estimate = CreditsService().estimate_generation(
            user=user,
            ai_model=model,
            generation_config={"videoDuration": 5, "resolution": "720p"},
        )

        assert estimate.error is None
        assert estimate.cost == Decimal("3.00")
