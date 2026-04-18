import logging
from decimal import Decimal
from django.db import transaction
from apps.credits.services import CreditsService
from apps.credits.models import CreditsTransaction
from .models import OnboardingTask, UserTaskCompletion, UserOnboardingState

logger = logging.getLogger(__name__)


class OnboardingService:
    def try_complete(self, user, event_name: str, *, pay_reward: bool = True):
        """Attempt to complete a task triggered by event_name. Idempotent."""
        task = OnboardingTask.objects.filter(
            trigger_event=event_name, is_active=True,
        ).first()
        if not task:
            return None

        with transaction.atomic():
            completion, created = UserTaskCompletion.objects.get_or_create(
                user=user, task=task,
            )
            if created and pay_reward and task.reward > 0:
                result = CreditsService().topup(
                    user, task.reward,
                    reason=CreditsTransaction.REASON_ONBOARDING_TASK,
                    metadata={'task_code': task.code},
                )
                completion.reward_paid = True
                completion.save(update_fields=['reward_paid'])
                new_balance = result.balance_after
                transaction.on_commit(
                    lambda: self._notify_task_completed(user, task, new_balance)
                )
        return completion

    def complete_by_code(self, user, task_code: str):
        """Complete a frontend_action task by code. Idempotent."""
        task = OnboardingTask.objects.filter(
            code=task_code, trigger_type='frontend_action', is_active=True,
        ).first()
        if not task:
            return None

        with transaction.atomic():
            completion, created = UserTaskCompletion.objects.get_or_create(
                user=user, task=task,
            )
            if created and task.reward > 0:
                result = CreditsService().topup(
                    user, task.reward,
                    reason=CreditsTransaction.REASON_ONBOARDING_TASK,
                    metadata={'task_code': task.code},
                )
                completion.reward_paid = True
                completion.save(update_fields=['reward_paid'])
                new_balance = result.balance_after
                # Attach balance to completion for the caller to avoid a
                # separate re-query that could race with concurrent requests.
                completion._balance_after = new_balance
                transaction.on_commit(
                    lambda: self._notify_task_completed(user, task, new_balance)
                )
        return completion

    def get_state(self, user):
        """Get full onboarding state. Creates UserOnboardingState if missing. Runs backfill once."""
        state, _ = UserOnboardingState.objects.get_or_create(user=user)
        if not state.backfill_done:
            self.backfill_for_user(user, state)
        return state

    def backfill_for_user(self, user, state=None):
        """For users who registered before onboarding. Mark existing actions as completed (no reward)."""
        if state is None:
            state, _ = UserOnboardingState.objects.get_or_create(user=user)

        backfill_checks = {
            'create_project': user.projects.exists(),
            'create_scene': self._user_has_scenes(user),
            'first_generation': self._user_has_generation(user),
            'first_upload': self._user_has_upload(user),
            'share_project': self._user_has_shared_link(user),
        }

        for code, exists in backfill_checks.items():
            if exists:
                task = OnboardingTask.objects.filter(code=code, is_active=True).first()
                if task:
                    UserTaskCompletion.objects.get_or_create(
                        user=user, task=task,
                        defaults={'reward_paid': False},
                    )

        state.backfill_done = True
        state.save(update_fields=['backfill_done'])

    def _user_has_scenes(self, user):
        from apps.scenes.models import Scene
        return Scene.objects.filter(project__user=user).exists()

    def _user_has_generation(self, user):
        from apps.elements.models import Element
        return Element.objects.filter(
            scene__project__user=user, source_type='GENERATED', status='COMPLETED',
        ).exists()

    def _user_has_upload(self, user):
        from apps.elements.models import Element
        return Element.objects.filter(
            scene__project__user=user, source_type='UPLOADED', status='COMPLETED',
        ).exists()

    def _user_has_shared_link(self, user):
        from apps.sharing.models import SharedLink
        return SharedLink.objects.filter(project__user=user).exists()

    def _notify_task_completed(self, user, task, new_balance):
        """Send WebSocket notification via user_{id} channel."""
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync

            total = OnboardingTask.objects.filter(is_active=True).count()
            completed = UserTaskCompletion.objects.filter(
                user=user, task__is_active=True,
            ).count()

            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f'user_{user.id}',
                {
                    'type': 'onboarding_task_completed',
                    'task_code': task.code,
                    'task_title': task.title,
                    'reward': str(task.reward),
                    'new_balance': str(new_balance),
                    'completed_count': completed,
                    'total_count': total,
                },
            )
        except Exception:
            # WebSocket push is best-effort; reward is already granted in DB.
            logger.exception(
                "onboarding task-completed broadcast failed",
                extra={"user_id": getattr(user, "id", None), "task_code": task.code},
            )
