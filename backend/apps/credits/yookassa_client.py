"""Thin wrapper around YooKassa SDK.

Isolates all YooKassa API calls so the rest of the app
never imports yookassa directly.
"""
import ipaddress
import logging
import uuid

from django.conf import settings
from yookassa import Configuration, Payment as YKPayment

logger = logging.getLogger(__name__)


def _configure():
    """Set YooKassa credentials from Django settings."""
    Configuration.account_id = settings.YOOKASSA_SHOP_ID
    Configuration.secret_key = settings.YOOKASSA_SECRET_KEY


def create_payment(*, amount: str, payment_method_type: str, description: str, metadata: dict | None = None) -> dict:
    """Create a payment in YooKassa and return the raw response dict."""
    _configure()
    idempotency_key = str(uuid.uuid4())

    payment_data = {
        "amount": {"value": amount, "currency": "RUB"},
        "confirmation": {
            "type": "redirect",
            "return_url": settings.YOOKASSA_RETURN_URL,
        },
        "capture": True,
        "description": description,
        "metadata": metadata or {},
    }

    if payment_method_type == "sbp":
        payment_data["payment_method_data"] = {"type": "sbp"}
    elif payment_method_type == "bank_card":
        payment_data["payment_method_data"] = {"type": "bank_card"}
    elif payment_method_type == "sberbank":
        payment_data["payment_method_data"] = {"type": "sberbank"}

    response = YKPayment.create(payment_data, idempotency_key)
    logger.info("YooKassa payment created: %s status=%s", response.id, response.status)
    return {
        "id": response.id,
        "status": response.status,
        "confirmation_url": response.confirmation.confirmation_url if response.confirmation else None,
    }


def get_payment_status(yookassa_payment_id: str) -> dict:
    """Fetch current payment status from YooKassa API."""
    _configure()
    response = YKPayment.find_one(yookassa_payment_id)
    return {
        "id": response.id,
        "status": response.status,
        "paid": response.paid,
        "amount": response.amount.value if response.amount else None,
        "cancellation_details": (
            {"reason": response.cancellation_details.reason,
             "party": response.cancellation_details.party}
            if response.cancellation_details else None
        ),
    }


def is_trusted_ip(ip: str) -> bool:
    """Check if IP is in YooKassa webhook whitelist."""
    addr = ipaddress.ip_address(ip)
    for network_str in settings.YOOKASSA_WEBHOOK_IPS:
        try:
            if addr in ipaddress.ip_network(network_str):
                return True
        except ValueError:
            if str(addr) == network_str:
                return True
    return False
