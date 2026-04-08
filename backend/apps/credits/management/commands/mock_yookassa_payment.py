"""Mock YooKassa payment for local testing and demo.

Usage:
    python manage.py mock_yookassa_payment <username> <amount> [--method sbp|bank_card|sberbank] [--status succeeded|canceled|pending]
    python manage.py mock_yookassa_payment <username> --list
"""
import uuid
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError

from apps.users.models import User
from apps.credits.models import Payment, PaymentWebhookLog, CreditsTransaction
from apps.credits.services import PaymentService


class Command(BaseCommand):
    help = "Simulate YooKassa payment for local testing"

    def add_arguments(self, parser):
        parser.add_argument("username", type=str, help="Username to create payment for")
        parser.add_argument("amount", type=int, nargs="?", default=None, help="Amount in rubles")
        parser.add_argument("--method", type=str, default="sbp", choices=["sbp", "bank_card", "sberbank"])
        parser.add_argument("--status", type=str, default="succeeded", choices=["succeeded", "canceled", "pending"])
        parser.add_argument("--list", action="store_true", help="List all payments for user")

    def handle(self, *args, **options):
        username = options["username"]
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            raise CommandError(f"User '{username}' not found")

        if options["list"]:
            self._list_payments(user)
            return

        amount = options["amount"]
        if not amount:
            raise CommandError("Amount is required (unless --list)")
        if amount < 100:
            raise CommandError("Minimum amount is 100₽")

        method = options["method"]
        status = options["status"]

        self.stdout.write(f"\n{'='*50}")
        self.stdout.write(f"Mock YooKassa Payment")
        self.stdout.write(f"{'='*50}")
        self.stdout.write(f"User:    {user.username} (balance: {user.balance} Кадров)")
        self.stdout.write(f"Amount:  {amount}₽")
        self.stdout.write(f"Method:  {method}")
        self.stdout.write(f"Status:  {status}")
        self.stdout.write(f"{'='*50}\n")

        # Step 1: Create Payment record (simulating what create_payment does, but without calling YooKassa)
        fake_yk_id = f"mock_{uuid.uuid4().hex[:12]}"
        payment = Payment.objects.create(
            user=user,
            yookassa_payment_id=fake_yk_id,
            amount=Decimal(str(amount)),
            payment_method_type=method,
            status=Payment.STATUS_PENDING,
            metadata={"mock": True, "confirmation_url": "http://localhost:3000/cabinet/balance"},
        )
        self.stdout.write(self.style.SUCCESS(f"[1/3] Payment created: {fake_yk_id}"))

        if status == "pending":
            self.stdout.write(self.style.WARNING("[2/3] Skipping webhook (status=pending)"))
            self.stdout.write(self.style.WARNING(f"[3/3] Balance unchanged: {user.balance} Кадров"))
            self._summary(payment, user)
            return

        # Step 2: Simulate webhook processing
        if status == "succeeded":
            PaymentService.process_succeeded(payment.id)
            user.refresh_from_db()
            self.stdout.write(self.style.SUCCESS("[2/3] Webhook processed: payment.succeeded"))
            self.stdout.write(self.style.SUCCESS(f"[3/3] Balance updated: {user.balance} Кадров (+{amount})"))
        elif status == "canceled":
            PaymentService.process_canceled(payment.id, "mock: user canceled")
            self.stdout.write(self.style.WARNING("[2/3] Webhook processed: payment.canceled"))
            self.stdout.write(self.style.WARNING(f"[3/3] Balance unchanged: {user.balance} Кадров"))

        # Step 3: Create webhook log entry for audit trail
        PaymentWebhookLog.objects.create(
            payment=payment,
            yookassa_payment_id=fake_yk_id,
            event_type=f"payment.{status}",
            raw_body={
                "event": f"payment.{status}",
                "object": {
                    "id": fake_yk_id,
                    "status": status,
                    "amount": {"value": str(amount), "currency": "RUB"},
                },
                "mock": True,
            },
            ip_address="127.0.0.1",
            processing_result=PaymentWebhookLog.RESULT_OK,
            processing_time_ms=0,
        )
        self.stdout.write(self.style.SUCCESS("WebhookLog entry created"))

        self._summary(payment, user)

    def _summary(self, payment, user):
        user.refresh_from_db()
        payment.refresh_from_db()
        self.stdout.write(f"\n{'='*50}")
        self.stdout.write("RESULT")
        self.stdout.write(f"{'='*50}")
        self.stdout.write(f"Payment ID:   {payment.yookassa_payment_id}")
        self.stdout.write(f"Status:       {payment.get_status_display()}")
        self.stdout.write(f"Amount:       {payment.amount}₽")
        self.stdout.write(f"User balance: {user.balance} Кадров")
        tx = CreditsTransaction.objects.filter(
            user=user, reason=CreditsTransaction.REASON_PAYMENT_TOPUP
        ).order_by("-created_at").first()
        if tx:
            self.stdout.write(f"Transaction:  +{tx.amount} → {tx.balance_after} Кадров")
        self.stdout.write(f"{'='*50}\n")
        self.stdout.write("View in admin: http://localhost:8000/admin/credits/payment/")

    def _list_payments(self, user):
        payments = Payment.objects.filter(user=user).order_by("-created_at")[:20]
        if not payments:
            self.stdout.write("No payments found")
            return
        self.stdout.write(f"\nPayments for {user.username} (last 20):")
        self.stdout.write(f"{'ID':<36} {'Amount':>8} {'Method':<12} {'Status':<12} {'Date'}")
        self.stdout.write("-" * 90)
        for p in payments:
            self.stdout.write(
                f"{p.yookassa_payment_id:<36} {p.amount:>7}₽ {p.get_payment_method_type_display():<12} "
                f"{p.get_status_display():<12} {p.created_at:%Y-%m-%d %H:%M}"
            )
