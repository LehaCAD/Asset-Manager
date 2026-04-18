"""Celery tasks for payment processing."""
import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name="reconcile_pending_payments", soft_time_limit=120)
def reconcile_pending_payments():
    """Check pending payments older than 10 min against YooKassa API.

    Safety net for lost webhooks:
    - succeeded → credit the user
    - canceled → update status
    - pending + older than 2h → mark expired
    """
    from .models import Payment
    from .services import PaymentService
    from . import yookassa_client

    cutoff = timezone.now() - timedelta(minutes=10)
    expire_cutoff = timezone.now() - timedelta(hours=2)

    pending = Payment.objects.filter(
        status=Payment.STATUS_PENDING,
        created_at__lt=cutoff,
    ).select_related("user")

    reconciled = 0
    for payment in pending:
        try:
            yk_status = yookassa_client.get_payment_status(payment.yookassa_payment_id)
            remote_status = yk_status["status"]

            if remote_status == "succeeded":
                PaymentService.process_succeeded(payment.id)
                logger.info("Reconciled payment %s: succeeded", payment.yookassa_payment_id)
                reconciled += 1
            elif remote_status == "canceled":
                reason = ""
                if yk_status.get("cancellation_details"):
                    cd = yk_status["cancellation_details"]
                    reason = f"{cd.get('party', '')}: {cd.get('reason', '')}"
                PaymentService.process_canceled(payment.id, reason)
                logger.info("Reconciled payment %s: canceled", payment.yookassa_payment_id)
                reconciled += 1
            elif payment.created_at < expire_cutoff:
                payment.status = Payment.STATUS_EXPIRED
                payment.error_message = "Expired: no confirmation within 2 hours"
                payment.save()
                logger.info("Expired payment %s", payment.yookassa_payment_id)
                reconciled += 1

        except Exception:
            logger.exception("Error reconciling payment %s", payment.yookassa_payment_id)

    if reconciled:
        logger.info("Reconciliation complete: %d payments processed", reconciled)
