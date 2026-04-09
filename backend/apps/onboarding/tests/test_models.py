from decimal import Decimal
from django.test import TestCase
from django.db import IntegrityError
from apps.users.models import User
from apps.onboarding.models import OnboardingTask, UserTaskCompletion, UserOnboardingState


def _make_user(username='testuser', balance=None):
    user = User.objects.create_user(username=username, password='test123')
    if balance is not None:
        user.balance = balance
        user.save(update_fields=['balance'])
    return user


def _make_task(**kwargs):
    defaults = dict(
        code='test_task', title='Test', description='Desc',
        icon='star', reward=Decimal('5'), order=1,
        category='onboarding', trigger_type='backend_signal',
        trigger_event='test.event',
    )
    defaults.update(kwargs)
    return OnboardingTask.objects.create(**defaults)


class OnboardingTaskModelTest(TestCase):
    def test_create_task(self):
        task = _make_task()
        self.assertEqual(task.code, 'test_task')
        self.assertTrue(task.is_active)

    def test_code_unique(self):
        _make_task(code='unique')
        with self.assertRaises(IntegrityError):
            _make_task(code='unique')

    def test_ordering(self):
        _make_task(code='b', order=2)
        _make_task(code='a', order=1)
        tasks = list(OnboardingTask.objects.values_list('code', flat=True))
        self.assertEqual(tasks, ['a', 'b'])


class UserOnboardingStateTest(TestCase):
    def test_create_state(self):
        user = _make_user()
        state = UserOnboardingState.objects.create(user=user)
        self.assertFalse(state.welcome_seen)
        self.assertFalse(state.backfill_done)


class UserTaskCompletionTest(TestCase):
    def test_complete_task(self):
        user = _make_user()
        task = _make_task()
        completion = UserTaskCompletion.objects.create(user=user, task=task)
        self.assertFalse(completion.reward_paid)

    def test_unique_together(self):
        user = _make_user()
        task = _make_task()
        UserTaskCompletion.objects.create(user=user, task=task)
        with self.assertRaises(IntegrityError):
            UserTaskCompletion.objects.create(user=user, task=task)
