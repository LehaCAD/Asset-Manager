"""
Adapter for external service dependencies.
Isolates feedback module from direct coupling to credits and notifications.
"""
from decimal import Decimal
from django.contrib.auth import get_user_model

User = get_user_model()


class CreditsAdapter:
    """Interface to credits system — changes to CreditsService isolated here."""

    @staticmethod
    def grant_reward(user, amount: Decimal, metadata: dict):
        """Grant credits to user. Returns CreditsTransaction or None."""
        from apps.credits.services import CreditsService
        from apps.credits.models import CreditsTransaction
        service = CreditsService()
        service.topup(
            user=user,
            amount=amount,
            reason=CreditsTransaction.REASON_FEEDBACK_REWARD,
            metadata=metadata,
        )
        # Find the created transaction by marker
        marker = metadata.get('reward_marker')
        if marker:
            return CreditsTransaction.objects.filter(
                user=user,
                metadata__contains={"reward_marker": marker},
            ).first()
        return None
