import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import CreditsTransaction

logger = logging.getLogger(__name__)


@receiver(post_save, sender=CreditsTransaction)
def notify_credits_changed(sender, instance: CreditsTransaction, created, **kwargs):
    """Push new balance to the user's WS group on any credits transaction."""
    if not created:
        return
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(
            f'user_{instance.user_id}',
            {
                'type': 'credits_changed',
                'balance': str(instance.balance_after),
                'amount': str(instance.amount),
                'reason': instance.reason,
            },
        )
    except Exception as e:
        logger.warning('Failed to send credits WS notification: %s', e)
