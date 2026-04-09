from decimal import Decimal
from django.test import TestCase
from apps.users.models import User
from apps.onboarding.models import OnboardingTask, UserTaskCompletion, UserOnboardingState
from apps.credits.models import CreditsTransaction


def _make_user(username='testuser', balance=Decimal('100')):
    user = User.objects.create_user(username=username, password='test123')
    user.balance = balance
    user.save(update_fields=['balance'])
    return user


def _make_task(**kwargs):
    """Create an OnboardingTask, or get existing one if code already exists (seed data)."""
    defaults = dict(
        code='test_task_unique_x7q',
        title='Test Task',
        description='Test description',
        icon='star',
        reward=Decimal('5'),
        order=99,
        category='onboarding',
        trigger_type='backend_signal',
        trigger_event='test.event.unique',
        is_active=True,
    )
    defaults.update(kwargs)
    # Use get_or_create to handle seed data
    task, _ = OnboardingTask.objects.get_or_create(
        code=defaults.pop('code'),
        defaults=defaults,
    )
    # Update fields if task already exists (e.g. to override is_active)
    for key, value in defaults.items():
        setattr(task, key, value)
    task.save()
    return task


class TryCompleteTest(TestCase):
    def test_try_complete_pays_reward(self):
        """Completing a task creates completion row, marks reward_paid, credits transaction."""
        from apps.onboarding.services import OnboardingService
        user = _make_user()
        # Use existing seeded task with trigger_event='project.created'
        task = OnboardingTask.objects.get(code='create_project')

        svc = OnboardingService()
        completion = svc.try_complete(user, 'project.created')

        self.assertIsNotNone(completion)
        self.assertTrue(completion.reward_paid)
        self.assertEqual(completion.task, task)

        tx = CreditsTransaction.objects.filter(user=user, reason='onboarding_task').first()
        self.assertIsNotNone(tx)
        self.assertEqual(tx.amount, task.reward)

    def test_try_complete_idempotent(self):
        """Calling try_complete twice on same event doesn't double-pay."""
        from apps.onboarding.services import OnboardingService
        user = _make_user()
        # Uses seeded task with trigger_event='project.created'

        svc = OnboardingService()
        svc.try_complete(user, 'project.created')
        svc.try_complete(user, 'project.created')

        completions = UserTaskCompletion.objects.filter(user=user)
        self.assertEqual(completions.count(), 1)

        txs = CreditsTransaction.objects.filter(user=user, reason='onboarding_task')
        self.assertEqual(txs.count(), 1)

    def test_try_complete_skips_inactive(self):
        """Task with is_active=False is not completed."""
        from apps.onboarding.services import OnboardingService
        user = _make_user()
        # Create a dedicated task for this test, inactive
        task = OnboardingTask.objects.create(
            code='test_inactive_task',
            title='Inactive Task',
            description='Inactive',
            icon='x-circle',
            reward=Decimal('5'),
            order=98,
            category='onboarding',
            trigger_type='backend_signal',
            trigger_event='test.inactive.event',
            is_active=False,
        )

        svc = OnboardingService()
        result = svc.try_complete(user, 'test.inactive.event')

        self.assertIsNone(result)
        self.assertEqual(UserTaskCompletion.objects.filter(user=user).count(), 0)

    def test_try_complete_wrong_event(self):
        """Event name not matching any task returns None."""
        from apps.onboarding.services import OnboardingService
        user = _make_user()

        svc = OnboardingService()
        result = svc.try_complete(user, 'nonexistent.event.xyz123')

        self.assertIsNone(result)


class BackfillTest(TestCase):
    def test_backfill_marks_existing_projects(self):
        """User with existing project gets create_project task completed without reward."""
        from apps.onboarding.services import OnboardingService
        from apps.projects.models import Project
        user = _make_user()
        Project.objects.create(user=user, name='My Project')
        task = OnboardingTask.objects.get(code='create_project')

        svc = OnboardingService()
        svc.backfill_for_user(user)

        completion = UserTaskCompletion.objects.filter(user=user, task=task).first()
        self.assertIsNotNone(completion)
        self.assertFalse(completion.reward_paid)

        # No credits transaction — backfill does not pay reward
        txs = CreditsTransaction.objects.filter(user=user, reason='onboarding_task')
        self.assertEqual(txs.count(), 0)

    def test_backfill_sets_done(self):
        """After backfill, state.backfill_done=True."""
        from apps.onboarding.services import OnboardingService
        user = _make_user()
        state, _ = UserOnboardingState.objects.get_or_create(user=user)

        svc = OnboardingService()
        svc.backfill_for_user(user, state)

        state.refresh_from_db()
        self.assertTrue(state.backfill_done)

    def test_backfill_idempotent(self):
        """Second backfill call is a no-op (no duplicate completions)."""
        from apps.onboarding.services import OnboardingService
        from apps.projects.models import Project
        user = _make_user()
        Project.objects.create(user=user, name='My Project')

        svc = OnboardingService()
        svc.backfill_for_user(user)
        svc.backfill_for_user(user)

        completions = UserTaskCompletion.objects.filter(user=user)
        self.assertEqual(completions.count(), 1)


class GetStateTest(TestCase):
    def test_get_state_creates_state(self):
        """User with no UserOnboardingState: get_state() creates one."""
        from apps.onboarding.services import OnboardingService
        user = _make_user()
        self.assertFalse(UserOnboardingState.objects.filter(user=user).exists())

        svc = OnboardingService()
        state = svc.get_state(user)

        self.assertIsNotNone(state)
        self.assertIsInstance(state, UserOnboardingState)
        self.assertTrue(UserOnboardingState.objects.filter(user=user).exists())

    def test_get_state_triggers_backfill(self):
        """First call to get_state triggers backfill and sets backfill_done=True."""
        from apps.onboarding.services import OnboardingService
        user = _make_user()

        svc = OnboardingService()
        state = svc.get_state(user)

        self.assertTrue(state.backfill_done)
