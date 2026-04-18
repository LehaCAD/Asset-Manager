"""Tests for subscription API views."""

from datetime import timedelta

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.subscriptions.models import Feature, Plan, Subscription

User = get_user_model()


class ViewsBaseTest(TestCase):
    """Base with plan/feature fixtures."""

    def setUp(self):
        Subscription.objects.all().delete()
        Feature.objects.all().delete()
        Plan.objects.all().delete()

        self.free_plan = Plan.objects.create(
            code='free', name='Free', price=0,
            max_projects=1, is_default=True, is_active=True, display_order=1,
        )
        self.pro_plan = Plan.objects.create(
            code='pro', name='Pro', price=990,
            max_projects=0, is_trial_reference=True, is_active=True, display_order=2,
        )
        self.inactive_plan = Plan.objects.create(
            code='legacy', name='Legacy', price=100,
            is_active=False, display_order=99,
        )
        self.sharing_feature = Feature.objects.create(
            code='sharing', title='Sharing', min_plan=self.pro_plan,
        )
        self.pro_plan.features.add(self.sharing_feature)

        self.client = APIClient()

    def _make_user(self, username='testuser'):
        return User.objects.create_user(
            username=username,
            email=f'{username}@test.com',
            password='testpass123',
        )

    def _set_subscription(self, user, *, plan=None, status='active', expires_delta_days=30):
        sub = user.subscription
        sub.plan = plan or self.free_plan
        sub.status = status
        sub.expires_at = timezone.now() + timedelta(days=expires_delta_days)
        sub.save()
        return sub


class PlanListViewTest(ViewsBaseTest):
    """Tests for GET /api/subscriptions/plans/."""

    def test_returns_only_active_plans(self):
        resp = self.client.get('/api/subscriptions/plans/')
        self.assertEqual(resp.status_code, 200)
        codes = [p['code'] for p in resp.data]
        self.assertIn('free', codes)
        self.assertIn('pro', codes)
        self.assertNotIn('legacy', codes)

    def test_features_nested(self):
        resp = self.client.get('/api/subscriptions/plans/')
        self.assertEqual(resp.status_code, 200)
        pro = next(p for p in resp.data if p['code'] == 'pro')
        self.assertIn('features', pro)
        feat_codes = [f['code'] for f in pro['features']]
        self.assertIn('sharing', feat_codes)

    def test_works_without_auth(self):
        """PlanListView is AllowAny."""
        resp = self.client.get('/api/subscriptions/plans/')
        self.assertEqual(resp.status_code, 200)

    def test_plan_fields(self):
        resp = self.client.get('/api/subscriptions/plans/')
        self.assertEqual(resp.status_code, 200)
        plan = resp.data[0]
        expected_fields = {
            'code', 'name', 'price', 'credits_per_month',
            'max_projects', 'max_scenes_per_project',
            'storage_limit_gb', 'features', 'is_recommended', 'display_order',
            'trial_duration_days', 'trial_bonus_credits', 'is_trial_reference',
        }
        self.assertEqual(set(plan.keys()), expected_fields)

    def test_plans_ordered_by_display_order(self):
        resp = self.client.get('/api/subscriptions/plans/')
        orders = [p['display_order'] for p in resp.data]
        self.assertEqual(orders, sorted(orders))

    def test_free_plan_has_no_features(self):
        resp = self.client.get('/api/subscriptions/plans/')
        free = next(p for p in resp.data if p['code'] == 'free')
        self.assertEqual(len(free['features']), 0)


class FeatureGateViewTest(ViewsBaseTest):
    """Tests for GET /api/subscriptions/feature-gate/<code>/."""

    def test_returns_feature_info(self):
        user = self._make_user()
        self.client.force_authenticate(user=user)
        resp = self.client.get('/api/subscriptions/feature-gate/sharing/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['code'], 'sharing')
        self.assertEqual(resp.data['title'], 'Sharing')
        self.assertEqual(resp.data['min_plan_name'], 'Pro')

    def test_returns_404_for_invalid_code(self):
        user = self._make_user()
        self.client.force_authenticate(user=user)
        resp = self.client.get('/api/subscriptions/feature-gate/nonexistent/')
        self.assertEqual(resp.status_code, 404)

    def test_requires_authentication(self):
        resp = self.client.get('/api/subscriptions/feature-gate/sharing/')
        self.assertIn(resp.status_code, [401, 403])

    def test_feature_gate_fields(self):
        user = self._make_user()
        self.client.force_authenticate(user=user)
        resp = self.client.get('/api/subscriptions/feature-gate/sharing/')
        self.assertEqual(resp.status_code, 200)
        expected_fields = {
            'code', 'title', 'description', 'icon',
            'min_plan_name', 'min_plan_price',
        }
        self.assertEqual(set(resp.data.keys()), expected_fields)

    def test_min_plan_price_is_float(self):
        user = self._make_user()
        self.client.force_authenticate(user=user)
        resp = self.client.get('/api/subscriptions/feature-gate/sharing/')
        self.assertIsInstance(resp.data['min_plan_price'], float)
