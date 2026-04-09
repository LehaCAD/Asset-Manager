"""Comprehensive tests for YooKassa payment integration.

Covers: models, yookassa_client, PaymentService, webhook view,
TopUpCreateView, TopUpStatusView, reconciliation task.
"""

from decimal import Decimal
from datetime import timedelta
from unittest.mock import patch, MagicMock

from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.users.models import User
from apps.credits.models import Payment, PaymentWebhookLog, CreditsTransaction
from apps.credits.services import PaymentService, CreditsService
from apps.credits.serializers import CreditsEstimateRequestSerializer
from apps.credits.tasks import reconcile_pending_payments
from apps.credits import yookassa_client


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

YOOKASSA_WEBHOOK_IPS_TEST = [
    "185.71.76.0/27",
    "185.71.77.0/27",
    "77.75.153.0/25",
    "77.75.156.11",
    "77.75.156.35",
]

# Trial bonus (50) is auto-credited via signal on create_user when a default
# Plan exists (seeded by subscriptions migration 0002_seed_plans).
TRIAL_BONUS = Decimal("50.00")


def _make_user(username="testuser", balance=None):
    """Create a user.  After the post_save signal, balance = TRIAL_BONUS.

    If *balance* is given explicitly, we overwrite whatever the signal set.
    """
    user = User.objects.create_user(username=username, password="test123")
    if balance is not None:
        user.balance = balance
        user.save(update_fields=["balance"])
    return user


def _make_payment(user, yk_id="yk_test_123", amount=Decimal("500.00"),
                  status=Payment.STATUS_PENDING, **kwargs):
    return Payment.objects.create(
        user=user,
        yookassa_payment_id=yk_id,
        amount=amount,
        payment_method_type=Payment.METHOD_BANK_CARD,
        status=status,
        **kwargs,
    )


def _webhook_body(event="payment.succeeded", yk_id="yk_test_123",
                  cancel_reason=None):
    obj = {"id": yk_id, "status": event.split(".")[-1]}
    if cancel_reason:
        obj["cancellation_details"] = {"reason": cancel_reason, "party": "yoo_money"}
    return {"event": event, "object": obj}


# ============================================================================
# 1. Model tests
# ============================================================================

class TestPaymentModel(TestCase):
    def test_create_payment_with_required_fields(self):
        user = _make_user()
        payment = _make_payment(user)
        self.assertEqual(payment.user, user)
        self.assertEqual(payment.yookassa_payment_id, "yk_test_123")
        self.assertEqual(payment.amount, Decimal("500.00"))
        self.assertEqual(payment.status, Payment.STATUS_PENDING)
        self.assertEqual(payment.payment_method_type, Payment.METHOD_BANK_CARD)

    def test_payment_status_transition(self):
        user = _make_user()
        payment = _make_payment(user)
        self.assertEqual(payment.status, Payment.STATUS_PENDING)
        payment.status = Payment.STATUS_SUCCEEDED
        payment.save()
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.STATUS_SUCCEEDED)

    def test_payment_str(self):
        user = _make_user("alice")
        payment = _make_payment(user, yk_id="yk_abc", amount=Decimal("1000.00"))
        expected = f"Payment yk_abc [pending] 1000.00₽ ({user})"
        self.assertEqual(str(payment), expected)

    def test_payment_status_constants(self):
        self.assertEqual(Payment.STATUS_PENDING, "pending")
        self.assertEqual(Payment.STATUS_SUCCEEDED, "succeeded")
        self.assertEqual(Payment.STATUS_CANCELED, "canceled")
        self.assertEqual(Payment.STATUS_EXPIRED, "expired")


class TestPaymentWebhookLogModel(TestCase):
    def test_create_webhook_log(self):
        user = _make_user()
        payment = _make_payment(user)
        log = PaymentWebhookLog.objects.create(
            payment=payment,
            yookassa_payment_id=payment.yookassa_payment_id,
            event_type="payment.succeeded",
            raw_body={"event": "payment.succeeded"},
            ip_address="185.71.76.1",
            is_trusted_ip=True,
            processing_result=PaymentWebhookLog.RESULT_OK,
        )
        self.assertIsNotNone(log.id)
        self.assertEqual(log.yookassa_payment_id, "yk_test_123")
        self.assertEqual(log.event_type, "payment.succeeded")
        self.assertTrue(log.is_trusted_ip)

    def test_webhook_log_str(self):
        log = PaymentWebhookLog(
            yookassa_payment_id="yk_999",
            event_type="payment.canceled",
            processing_result=PaymentWebhookLog.RESULT_ERROR,
        )
        self.assertEqual(
            str(log),
            "Webhook payment.canceled for yk_999 [error]",
        )

    def test_reason_payment_topup_exists(self):
        reason_codes = [code for code, _ in CreditsTransaction.REASON_CHOICES]
        self.assertIn(CreditsTransaction.REASON_PAYMENT_TOPUP, reason_codes)


# ============================================================================
# 2. YooKassa client — is_trusted_ip
# ============================================================================

@override_settings(YOOKASSA_WEBHOOK_IPS=YOOKASSA_WEBHOOK_IPS_TEST)
class TestYooKassaClient(SimpleTestCase):
    def test_trusted_ip_in_subnet(self):
        self.assertTrue(yookassa_client.is_trusted_ip("185.71.76.1"))

    def test_trusted_ip_exact_match(self):
        self.assertTrue(yookassa_client.is_trusted_ip("77.75.156.11"))

    def test_trusted_ip_second_exact(self):
        self.assertTrue(yookassa_client.is_trusted_ip("77.75.156.35"))

    def test_trusted_ip_subnet_boundary_start(self):
        self.assertTrue(yookassa_client.is_trusted_ip("185.71.76.0"))

    def test_trusted_ip_subnet_boundary_end(self):
        # 185.71.76.0/27 → last address 185.71.76.31
        self.assertTrue(yookassa_client.is_trusted_ip("185.71.76.31"))

    def test_untrusted_ip_random(self):
        self.assertFalse(yookassa_client.is_trusted_ip("1.2.3.4"))

    def test_untrusted_ip_private(self):
        self.assertFalse(yookassa_client.is_trusted_ip("10.0.0.1"))

    def test_untrusted_ip_outside_subnet(self):
        # 185.71.76.0/27 ends at .31 — .32 is outside
        self.assertFalse(yookassa_client.is_trusted_ip("185.71.76.32"))

    def test_trusted_ip_77_75_153_subnet(self):
        # 77.75.153.0/25 → 77.75.153.0 .. 77.75.153.127
        self.assertTrue(yookassa_client.is_trusted_ip("77.75.153.100"))

    def test_untrusted_ip_77_75_153_outside_subnet(self):
        # 77.75.153.0/25 → .128 is outside
        self.assertFalse(yookassa_client.is_trusted_ip("77.75.153.128"))


# ============================================================================
# 3. PaymentService tests
# ============================================================================

class TestPaymentService(TestCase):

    @patch("apps.credits.yookassa_client.create_payment")
    def test_create_payment_returns_payment_with_yk_id(self, mock_create):
        mock_create.return_value = {
            "id": "yk_new_001",
            "status": "pending",
            "confirmation_url": "https://yoomoney.ru/pay/123",
        }
        user = _make_user()
        payment = PaymentService.create_payment(
            user, Decimal("500.00"), "bank_card",
        )
        self.assertIsInstance(payment, Payment)
        self.assertEqual(payment.yookassa_payment_id, "yk_new_001")
        self.assertEqual(payment.amount, Decimal("500.00"))
        self.assertEqual(payment.status, Payment.STATUS_PENDING)
        self.assertEqual(
            payment.metadata["confirmation_url"],
            "https://yoomoney.ru/pay/123",
        )
        mock_create.assert_called_once()

    def test_process_succeeded_credits_user(self):
        user = _make_user(balance=Decimal("0.00"))
        payment = _make_payment(user, amount=Decimal("300.00"))
        result = PaymentService.process_succeeded(payment.id)
        self.assertTrue(result)
        payment.refresh_from_db()
        user.refresh_from_db()
        self.assertEqual(payment.status, Payment.STATUS_SUCCEEDED)
        self.assertEqual(user.balance, Decimal("300.00"))
        # Transaction created
        tx = CreditsTransaction.objects.filter(
            user=user,
            reason=CreditsTransaction.REASON_PAYMENT_TOPUP,
        )
        self.assertEqual(tx.count(), 1)
        self.assertEqual(tx.first().amount, Decimal("300.00"))

    def test_process_succeeded_idempotency(self):
        user = _make_user(balance=Decimal("0.00"))
        payment = _make_payment(user, amount=Decimal("300.00"))
        PaymentService.process_succeeded(payment.id)
        # Second call should be no-op
        result = PaymentService.process_succeeded(payment.id)
        self.assertFalse(result)
        user.refresh_from_db()
        self.assertEqual(user.balance, Decimal("300.00"))
        self.assertEqual(
            CreditsTransaction.objects.filter(
                user=user,
                reason=CreditsTransaction.REASON_PAYMENT_TOPUP,
            ).count(),
            1,
        )

    def test_process_canceled_updates_status(self):
        user = _make_user()
        payment = _make_payment(user)
        PaymentService.process_canceled(payment.id, reason="expired_on_confirmation")
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.STATUS_CANCELED)
        self.assertEqual(payment.error_message, "expired_on_confirmation")

    def test_process_canceled_idempotency_after_succeeded(self):
        user = _make_user(balance=Decimal("0.00"))
        payment = _make_payment(user, amount=Decimal("300.00"))
        PaymentService.process_succeeded(payment.id)
        # Trying to cancel an already succeeded payment is no-op
        PaymentService.process_canceled(payment.id, reason="late_cancel")
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.STATUS_SUCCEEDED)
        user.refresh_from_db()
        self.assertEqual(user.balance, Decimal("300.00"))


# ============================================================================
# 4. Webhook view tests
# ============================================================================

@override_settings(YOOKASSA_WEBHOOK_IPS=YOOKASSA_WEBHOOK_IPS_TEST)
class TestTopUpWebhookView(TestCase):
    WEBHOOK_URL = "/api/credits/topup/webhook/"

    def setUp(self):
        self.client = APIClient()
        self.user = _make_user(balance=Decimal("0.00"))

    def test_succeeded_webhook_credits_user(self):
        payment = _make_payment(self.user, amount=Decimal("500.00"))
        resp = self.client.post(
            self.WEBHOOK_URL,
            data=_webhook_body("payment.succeeded", payment.yookassa_payment_id),
            format="json",
            HTTP_X_FORWARDED_FOR="185.71.76.1",
        )
        self.assertEqual(resp.status_code, 200)
        payment.refresh_from_db()
        self.user.refresh_from_db()
        self.assertEqual(payment.status, Payment.STATUS_SUCCEEDED)
        self.assertEqual(self.user.balance, Decimal("500.00"))
        # Log entry created
        log = PaymentWebhookLog.objects.filter(
            yookassa_payment_id=payment.yookassa_payment_id,
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.processing_result, "credited")

    def test_canceled_webhook_updates_status(self):
        payment = _make_payment(self.user)
        resp = self.client.post(
            self.WEBHOOK_URL,
            data=_webhook_body(
                "payment.canceled", payment.yookassa_payment_id,
                cancel_reason="expired_on_confirmation",
            ),
            format="json",
            HTTP_X_FORWARDED_FOR="185.71.76.1",
        )
        self.assertEqual(resp.status_code, 200)
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.STATUS_CANCELED)
        self.assertEqual(payment.error_message, "expired_on_confirmation")

    def test_untrusted_ip_rejected(self):
        payment = _make_payment(self.user)
        resp = self.client.post(
            self.WEBHOOK_URL,
            data=_webhook_body("payment.succeeded", payment.yookassa_payment_id),
            format="json",
            HTTP_X_FORWARDED_FOR="1.2.3.4",
        )
        self.assertEqual(resp.status_code, 200)
        # Payment status should NOT change
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.STATUS_PENDING)
        # Log entry with rejected result
        log = PaymentWebhookLog.objects.filter(
            yookassa_payment_id=payment.yookassa_payment_id,
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.processing_result, "rejected_untrusted_ip")

    def test_nonexistent_payment_returns_200(self):
        resp = self.client.post(
            self.WEBHOOK_URL,
            data=_webhook_body("payment.succeeded", "yk_nonexistent_999"),
            format="json",
            HTTP_X_FORWARDED_FOR="185.71.76.1",
        )
        self.assertEqual(resp.status_code, 200)
        log = PaymentWebhookLog.objects.filter(
            yookassa_payment_id="yk_nonexistent_999",
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.processing_result, "payment_not_found")

    def test_duplicate_webhook_already_succeeded(self):
        payment = _make_payment(
            self.user, amount=Decimal("500.00"),
            status=Payment.STATUS_SUCCEEDED,
        )
        resp = self.client.post(
            self.WEBHOOK_URL,
            data=_webhook_body("payment.succeeded", payment.yookassa_payment_id),
            format="json",
            HTTP_X_FORWARDED_FOR="185.71.76.1",
        )
        self.assertEqual(resp.status_code, 200)
        log = PaymentWebhookLog.objects.filter(
            yookassa_payment_id=payment.yookassa_payment_id,
        ).first()
        self.assertEqual(log.processing_result, "already_succeeded")
        # Balance unchanged (was 0.00, still 0.00)
        self.user.refresh_from_db()
        self.assertEqual(self.user.balance, Decimal("0.00"))

    def test_malformed_body_returns_200(self):
        """Send valid JSON that lacks expected structure."""
        resp = self.client.post(
            self.WEBHOOK_URL,
            data={"garbage": True},
            format="json",
            HTTP_X_FORWARDED_FOR="185.71.76.1",
        )
        self.assertEqual(resp.status_code, 200)


# ============================================================================
# 5. TopUpCreate view tests
# ============================================================================

class TestTopUpCreateView(TestCase):
    CREATE_URL = "/api/credits/topup/create/"

    def setUp(self):
        self.client = APIClient()
        self.user = _make_user("payuser")
        self.client.force_authenticate(self.user)

    @patch("apps.credits.yookassa_client.create_payment")
    def test_valid_request_returns_201(self, mock_create):
        mock_create.return_value = {
            "id": "yk_new_002",
            "status": "pending",
            "confirmation_url": "https://yoomoney.ru/pay/abc",
        }
        resp = self.client.post(
            self.CREATE_URL,
            data={"amount": 500, "payment_method_type": "bank_card"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["payment_id"], "yk_new_002")
        self.assertEqual(resp.data["confirmation_url"], "https://yoomoney.ru/pay/abc")
        self.assertEqual(resp.data["status"], "pending")

    def test_invalid_amount_below_minimum(self):
        resp = self.client.post(
            self.CREATE_URL,
            data={"amount": 50, "payment_method_type": "bank_card"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_invalid_payment_method(self):
        resp = self.client.post(
            self.CREATE_URL,
            data={"amount": 500, "payment_method_type": "bitcoin"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_unauthenticated_returns_401_or_403(self):
        client = APIClient()  # no auth
        resp = client.post(
            self.CREATE_URL,
            data={"amount": 500, "payment_method_type": "bank_card"},
            format="json",
        )
        self.assertIn(resp.status_code, [401, 403])

    @patch("apps.credits.yookassa_client.create_payment")
    def test_yookassa_api_error_returns_503(self, mock_create):
        mock_create.side_effect = Exception("YooKassa unavailable")
        resp = self.client.post(
            self.CREATE_URL,
            data={"amount": 500, "payment_method_type": "sbp"},
            format="json",
        )
        self.assertEqual(resp.status_code, 503)


# ============================================================================
# 6. TopUpStatus view tests
# ============================================================================

class TestTopUpStatusView(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.user = _make_user("statususer")
        self.client.force_authenticate(self.user)

    def test_get_status_own_payment(self):
        payment = _make_payment(self.user, yk_id="yk_status_1")
        resp = self.client.get("/api/credits/topup/yk_status_1/status/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "pending")
        self.assertEqual(resp.data["amount"], "500.00")

    def test_get_status_other_users_payment_returns_404(self):
        other_user = _make_user("other")
        _make_payment(other_user, yk_id="yk_other_1")
        resp = self.client.get("/api/credits/topup/yk_other_1/status/")
        self.assertEqual(resp.status_code, 404)

    def test_succeeded_payment_includes_balance(self):
        payment = _make_payment(
            self.user, yk_id="yk_done_1",
            amount=Decimal("1000.00"),
            status=Payment.STATUS_SUCCEEDED,
        )
        # Manually update balance to simulate credited state
        self.user.balance = Decimal("1000.00")
        self.user.save(update_fields=["balance"])

        resp = self.client.get("/api/credits/topup/yk_done_1/status/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "succeeded")
        self.assertIn("balance", resp.data)
        self.assertEqual(resp.data["balance"], "1000.00")

    def test_nonexistent_payment_returns_404(self):
        resp = self.client.get("/api/credits/topup/yk_ghost/status/")
        self.assertEqual(resp.status_code, 404)


# ============================================================================
# 7. Reconciliation task tests
# ============================================================================

class TestReconciliation(TestCase):

    @patch("apps.credits.yookassa_client.get_payment_status")
    def test_old_pending_succeeded_on_yookassa_credits_user(self, mock_status):
        mock_status.return_value = {
            "id": "yk_recon_1", "status": "succeeded", "paid": True,
            "amount": "500.00", "cancellation_details": None,
        }
        user = _make_user("recon1", balance=Decimal("0.00"))
        payment = _make_payment(user, yk_id="yk_recon_1", amount=Decimal("500.00"))
        # Backdate created_at beyond 10 min cutoff
        Payment.objects.filter(pk=payment.pk).update(
            created_at=timezone.now() - timedelta(minutes=15),
        )

        reconcile_pending_payments()

        payment.refresh_from_db()
        user.refresh_from_db()
        self.assertEqual(payment.status, Payment.STATUS_SUCCEEDED)
        self.assertEqual(user.balance, Decimal("500.00"))

    @patch("apps.credits.yookassa_client.get_payment_status")
    def test_old_pending_canceled_on_yookassa(self, mock_status):
        mock_status.return_value = {
            "id": "yk_recon_2", "status": "canceled", "paid": False,
            "amount": "500.00",
            "cancellation_details": {"reason": "expired_on_confirmation", "party": "yoo_money"},
        }
        user = _make_user("recon2")
        payment = _make_payment(user, yk_id="yk_recon_2")
        Payment.objects.filter(pk=payment.pk).update(
            created_at=timezone.now() - timedelta(minutes=15),
        )

        reconcile_pending_payments()

        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.STATUS_CANCELED)
        self.assertIn("expired_on_confirmation", payment.error_message)

    @patch("apps.credits.yookassa_client.get_payment_status")
    def test_old_pending_still_pending_over_2h_expired(self, mock_status):
        mock_status.return_value = {
            "id": "yk_recon_3", "status": "pending", "paid": False,
            "amount": "500.00", "cancellation_details": None,
        }
        user = _make_user("recon3")
        payment = _make_payment(user, yk_id="yk_recon_3")
        Payment.objects.filter(pk=payment.pk).update(
            created_at=timezone.now() - timedelta(hours=3),
        )

        reconcile_pending_payments()

        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.STATUS_EXPIRED)

    @patch("apps.credits.yookassa_client.get_payment_status")
    def test_fresh_pending_not_touched(self, mock_status):
        """Pending payment created < 10 min ago should not be reconciled."""
        user = _make_user("recon4")
        payment = _make_payment(user, yk_id="yk_recon_4")
        # created_at is "now" — within 10 min window

        reconcile_pending_payments()

        mock_status.assert_not_called()
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.STATUS_PENDING)

    @patch("apps.credits.yookassa_client.get_payment_status")
    def test_yookassa_error_continues_with_next(self, mock_status):
        """API error on one payment should not prevent processing the next."""
        user = _make_user("recon5", balance=Decimal("0.00"))
        p1 = _make_payment(user, yk_id="yk_err_1", amount=Decimal("100.00"))
        p2 = _make_payment(user, yk_id="yk_err_2", amount=Decimal("200.00"))
        cutoff = timezone.now() - timedelta(minutes=15)
        Payment.objects.filter(pk__in=[p1.pk, p2.pk]).update(created_at=cutoff)

        mock_status.side_effect = [
            Exception("API timeout"),
            {"id": "yk_err_2", "status": "succeeded", "paid": True,
             "amount": "200.00", "cancellation_details": None},
        ]

        reconcile_pending_payments()

        p1.refresh_from_db()
        p2.refresh_from_db()
        self.assertEqual(p1.status, Payment.STATUS_PENDING)  # Failed, untouched
        self.assertEqual(p2.status, Payment.STATUS_SUCCEEDED)  # Processed OK


# ============================================================================
# Existing serializer + service tests (preserved from original)
# ============================================================================

class CreditsServiceDebitFlatTests(TestCase):
    def setUp(self):
        self.user = _make_user("flat_user", balance=Decimal("100.00"))

    def test_debit_flat_success(self):
        result = CreditsService().debit_flat(
            user=self.user, amount=Decimal("5.00"),
            reason=CreditsTransaction.REASON_PROMPT_ENHANCEMENT,
        )
        assert result.ok is True
        assert result.cost == Decimal("5.00")
        self.user.refresh_from_db()
        assert self.user.balance == Decimal("95.00")

    def test_debit_flat_creates_transaction(self):
        CreditsService().debit_flat(
            user=self.user, amount=Decimal("3.00"),
            reason=CreditsTransaction.REASON_PROMPT_ENHANCEMENT,
        )
        tx = CreditsTransaction.objects.filter(
            user=self.user,
            reason=CreditsTransaction.REASON_PROMPT_ENHANCEMENT,
        ).last()
        assert tx is not None
        assert tx.amount == Decimal("-3.00")

    def test_debit_flat_insufficient_funds(self):
        result = CreditsService().debit_flat(
            user=self.user, amount=Decimal("999.00"),
            reason=CreditsTransaction.REASON_PROMPT_ENHANCEMENT,
        )
        assert result.ok is False
        self.user.refresh_from_db()
        assert self.user.balance == Decimal("100.00")

    def test_debit_flat_zero_amount(self):
        result = CreditsService().debit_flat(
            user=self.user, amount=Decimal("0.00"),
            reason=CreditsTransaction.REASON_PROMPT_ENHANCEMENT,
        )
        assert result.ok is True
        assert result.cost == Decimal("0.00")


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
        user.refresh_from_db()
        initial_balance = user.balance

        result = CreditsService().topup(
            user=user,
            amount=Decimal("100.00"),
            reason=CreditsTransaction.REASON_ADMIN_TOPUP,
            metadata={"source": "admin_action"},
        )

        user.refresh_from_db()
        self.assertEqual(user.balance, initial_balance + Decimal("100.00"))
        self.assertEqual(result.balance_after, initial_balance + Decimal("100.00"))
        self.assertEqual(
            CreditsTransaction.objects.filter(
                user=user,
                reason=CreditsTransaction.REASON_ADMIN_TOPUP,
                amount=Decimal("100.00"),
            ).count(),
            1,
        )


class CreditsServiceCompiledPricingTests(TestCase):
    def test_estimate_generation_uses_compiled_pricing_payload_from_bindings(self):
        from apps.ai_providers.models import (
            AIModel, AIProvider, CanonicalParameter,
            ModelParameterBinding, ModelPricingConfig,
        )
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
