import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from .models import Subscription

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Subscription)
def notify_subscription_changed(sender, instance, **kwargs):
    """Send WebSocket notification when subscription is updated."""
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return

        plan = instance.plan
        features = list(plan.features.values_list('code', flat=True))

        async_to_sync(channel_layer.group_send)(
            f'user_{instance.user_id}',
            {
                'type': 'subscription_changed',
                'plan_code': plan.code,
                'plan_name': plan.name,
                'status': instance.status,
                'features': features,
            },
        )
    except Exception as e:
        logger.warning('Failed to send subscription WS notification: %s', e)
