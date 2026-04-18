"""Tests for subscription serializers."""

from datetime import timedelta

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.subscriptions.models import Feature, Plan, Subscription
from apps.subscriptions.serializers import (
    FeatureGateSerializer,
    FeatureSerializer,
    PlanListSerializer,
    SubscriptionSerializer,
)
from apps.users.serializers import UserSerializer

User = get_user_model()


class SerializerBaseTest(TestCase):
    """Base with plan/feature fixtures."""

    def setUp(self):
        Subscription.objects.all().delete()
        Feature.objects.all().delete()
        Plan.objects.all().delete()

        self.free_plan = Plan.objects.create(
            code='free', name='Free', price=0,
            max_projects=1, max_scenes_per_project=10,
            storage_limit_gb=1,
            is_default=True, display_order=1,
        )
        self.pro_plan = Plan.objects.create(
            code='pro', name='Pro', price=990,
            max_projects=0, max_scenes_per_project=50,
            storage_limit_gb=100,
            is_trial_reference=True, display_order=2,
        )
        self.sharing_feature = Feature.objects.create(
            code='sharing', title='Sharing',
            description='Share with others', icon='link',
            min_plan=self.pro_plan,
        )
        self.pro_plan.features.add(self.sharing_feature)

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


class FeatureSerializerTest(SerializerBaseTest):
    """Tests for FeatureSerializer."""

    def test_fields(self):
        serializer = FeatureSerializer(self.sharing_feature)
        data = serializer.data
        self.assertEqual(set(data.keys()), {'code', 'title', 'description', 'icon'})
        self.assertEqual(data['code'], 'sharing')
        self.assertEqual(data['title'], 'Sharing')


class PlanListSerializerTest(SerializerBaseTest):
    """Tests for PlanListSerializer."""

    def test_fields(self):
        serializer = PlanListSerializer(self.pro_plan)
        data = serializer.data
        expected_fields = {
            'code', 'name', 'price', 'credits_per_month',
            'max_projects', 'max_scenes_per_project', 'storage_limit_gb',
            'features', 'is_recommended', 'display_order',
            'trial_duration_days', 'trial_bonus_credits', 'is_trial_reference',
        }
        self.assertEqual(set(data.keys()), expected_fields)

    def test_features_nested(self):
        serializer = PlanListSerializer(self.pro_plan)
        data = serializer.data
        self.assertEqual(len(data['features']), 1)
        self.assertEqual(data['features'][0]['code'], 'sharing')

    def test_free_plan_no_features(self):
        serializer = PlanListSerializer(self.free_plan)
        data = serializer.data
        self.assertEqual(len(data['features']), 0)


class SubscriptionSerializerTest(SerializerBaseTest):
    """Tests for SubscriptionSerializer."""

    def test_active_subscription_fields(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.pro_plan, status='active')
        sub = user.subscription
        serializer = SubscriptionSerializer(sub)
        data = serializer.data
        expected_fields = {
            'plan_code', 'plan_name', 'status', 'expires_at',
            'features', 'is_trial', 'trial_days_left', 'trial_total_days',
        }
        self.assertEqual(set(data.keys()), expected_fields)
        self.assertEqual(data['plan_code'], 'pro')
        self.assertEqual(data['plan_name'], 'Pro')
        self.assertEqual(data['status'], 'active')
        self.assertFalse(data['is_trial'])
        self.assertIsNone(data['trial_days_left'])

    def test_trial_subscription(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='trial', expires_delta_days=5)
        sub = user.subscription
        serializer = SubscriptionSerializer(sub)
        data = serializer.data
        self.assertTrue(data['is_trial'])
        self.assertIsNotNone(data['trial_days_left'])
        # Features should be from trial_reference plan (pro) — returned as string codes
        self.assertIn('sharing', data['features'])

    def test_free_subscription_no_features(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        sub = user.subscription
        serializer = SubscriptionSerializer(sub)
        data = serializer.data
        self.assertEqual(len(data['features']), 0)

    def test_expired_subscription(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.pro_plan, status='expired', expires_delta_days=-10)
        sub = user.subscription
        serializer = SubscriptionSerializer(sub)
        data = serializer.data
        self.assertEqual(data['status'], 'expired')
        self.assertFalse(data['is_trial'])


class FeatureGateSerializerTest(SerializerBaseTest):
    """Tests for FeatureGateSerializer."""

    def test_full_fields(self):
        data = {
            'code': 'sharing',
            'title': 'Sharing',
            'description': 'Share with others',
            'icon': 'link',
            'min_plan_name': 'Pro',
            'min_plan_price': 990.0,
        }
        serializer = FeatureGateSerializer(data)
        result = serializer.data
        self.assertEqual(result['code'], 'sharing')
        self.assertEqual(result['min_plan_name'], 'Pro')
        self.assertEqual(result['min_plan_price'], 990.0)

    def test_null_plan_fields(self):
        data = {
            'code': 'no_plan',
            'title': 'No Plan Feature',
            'description': '',
            'icon': '',
            'min_plan_name': None,
            'min_plan_price': None,
        }
        serializer = FeatureGateSerializer(data)
        result = serializer.data
        self.assertIsNone(result['min_plan_name'])
        self.assertIsNone(result['min_plan_price'])


class UserSerializerQuotaTest(SerializerBaseTest):
    """Tests for the quota/subscription fields in UserSerializer."""

    def test_user_serializer_has_quota_and_subscription(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.pro_plan, status='active')
        serializer = UserSerializer(user)
        data = serializer.data
        self.assertIn('quota', data)
        self.assertIn('subscription', data)

    def test_quota_has_correct_structure(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        serializer = UserSerializer(user)
        quota = serializer.data['quota']
        expected_keys = {
            'max_projects', 'used_projects',
            'storage_limit_bytes', 'storage_used_bytes',
        }
        self.assertEqual(set(quota.keys()), expected_keys)

    def test_subscription_field_with_active_subscription(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.pro_plan, status='active')
        serializer = UserSerializer(user)
        sub = serializer.data['subscription']
        self.assertIsNotNone(sub)
        self.assertEqual(sub['plan_code'], 'pro')

    def test_subscription_field_without_subscription(self):
        user = self._make_user()
        Subscription.objects.filter(user=user).delete()
        # Refetch user from DB to clear cached reverse relation
        user = User.objects.get(pk=user.pk)
        serializer = UserSerializer(user)
        sub = serializer.data['subscription']
        self.assertIsNone(sub)

    def test_quota_values_match_plan_limits(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        serializer = UserSerializer(user)
        quota = serializer.data['quota']
        self.assertEqual(quota['max_projects'], 1)
        self.assertEqual(quota['storage_limit_bytes'], 1 * 1024 ** 3)
