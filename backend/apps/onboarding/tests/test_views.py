from decimal import Decimal
from django.test import TestCase
from rest_framework.test import APIClient
from apps.users.models import User
from apps.onboarding.models import OnboardingTask, UserTaskCompletion, UserOnboardingState


def _make_user(username='apitest', balance=Decimal('100')):
    user = User.objects.create_user(username=username, password='test123')
    user.balance = balance
    user.save(update_fields=['balance'])
    return user


def _make_task(**kwargs):
    defaults = dict(
        code='open_lightbox',
        title='Открой лайтбокс',
        description='Нажми на карточку',
        icon='expand',
        reward=Decimal('5'),
        order=1,
        category='onboarding',
        trigger_type='frontend_action',
        trigger_event='',
        is_active=True,
    )
    defaults.update(kwargs)
    obj, _ = OnboardingTask.objects.get_or_create(
        code=defaults['code'],
        defaults={k: v for k, v in defaults.items() if k != 'code'},
    )
    # Ensure fields match in case it already existed
    for k, v in defaults.items():
        setattr(obj, k, v)
    obj.save()
    return obj


def _make_backend_task(**kwargs):
    defaults = dict(
        code='create_project',
        title='Создай проект',
        description='Создай первый проект',
        icon='folder-plus',
        reward=Decimal('10'),
        order=0,
        category='onboarding',
        trigger_type='backend_signal',
        trigger_event='project.created',
        is_active=True,
    )
    defaults.update(kwargs)
    obj, _ = OnboardingTask.objects.get_or_create(
        code=defaults['code'],
        defaults={k: v for k, v in defaults.items() if k != 'code'},
    )
    for k, v in defaults.items():
        setattr(obj, k, v)
    obj.save()
    return obj


class OnboardingAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = _make_user(username='apitest')
        self.client.force_authenticate(user=self.user)
        self.frontend_task = _make_task()
        self.backend_task = _make_backend_task()

    def test_get_state_authenticated(self):
        """GET /api/onboarding/ returns 200 with expected fields."""
        response = self.client.get('/api/onboarding/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('welcome_seen', data)
        self.assertIn('tasks', data)
        self.assertIn('total_earned', data)
        self.assertIn('total_possible', data)
        self.assertIn('completed_count', data)
        self.assertIn('total_count', data)
        self.assertIsInstance(data['tasks'], list)

    def test_get_state_unauthenticated(self):
        """GET without token returns 401."""
        anon_client = APIClient()
        response = anon_client.get('/api/onboarding/')
        self.assertEqual(response.status_code, 401)

    def test_welcome_seen_marks(self):
        """POST /api/onboarding/welcome-seen/ marks welcome_seen=True."""
        # Ensure state doesn't exist yet (or welcome_seen is False)
        UserOnboardingState.objects.filter(user=self.user).delete()

        response = self.client.post('/api/onboarding/welcome-seen/')
        self.assertEqual(response.status_code, 200)

        # Now check state has welcome_seen=True
        state_response = self.client.get('/api/onboarding/')
        self.assertEqual(state_response.status_code, 200)
        self.assertTrue(state_response.json()['welcome_seen'])

    def test_complete_frontend_task(self):
        """POST /api/onboarding/complete/ with valid frontend task returns reward info."""
        response = self.client.post(
            '/api/onboarding/complete/',
            {'task_code': 'open_lightbox'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['ok'])
        # Should have reward and new_balance since task has reward > 0
        self.assertIn('reward', data)
        self.assertIn('new_balance', data)

    def test_complete_already_completed(self):
        """POST complete again returns ok=True, already_completed=True."""
        # First completion
        self.client.post(
            '/api/onboarding/complete/',
            {'task_code': 'open_lightbox'},
            format='json',
        )
        # Second attempt
        response = self.client.post(
            '/api/onboarding/complete/',
            {'task_code': 'open_lightbox'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['ok'])
        self.assertTrue(data.get('already_completed', False))

    def test_complete_backend_signal_task_returns_400(self):
        """POST complete with backend_signal task returns 400."""
        response = self.client.post(
            '/api/onboarding/complete/',
            {'task_code': 'create_project'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
