"""Tests for subscription permissions."""

from datetime import timedelta

from django.test import TestCase, RequestFactory
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.subscriptions.models import Feature, Plan, Subscription
from apps.subscriptions.permissions import FeatureGatePermission, feature_required

User = get_user_model()


class PermissionBaseTest(TestCase):
    """Base with plan/feature fixtures."""

    def setUp(self):
        Subscription.objects.all().delete()
        Feature.objects.all().delete()
        Plan.objects.all().delete()

        self.free_plan = Plan.objects.create(
            code='free', name='Free', price=0,
            max_projects=1, is_default=True, display_order=1,
        )
        self.pro_plan = Plan.objects.create(
            code='pro', name='Pro', price=990,
            max_projects=0, is_trial_reference=True, display_order=2,
        )
        self.sharing_feature = Feature.objects.create(
            code='sharing', title='Sharing', min_plan=self.pro_plan,
        )
        self.pro_plan.features.add(self.sharing_feature)
        self.factory = RequestFactory()

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


class FeatureGatePermissionTest(PermissionBaseTest):
    """Tests for the base FeatureGatePermission class."""

    def test_unauthenticated_user_denied(self):
        request = self.factory.get('/')
        from django.contrib.auth.models import AnonymousUser
        request.user = AnonymousUser()

        perm = FeatureGatePermission()
        perm.feature_code = 'sharing'
        self.assertFalse(perm.has_permission(request, None))

    def test_no_feature_code_allows_authenticated(self):
        """If feature_code is None, permission passes for any authenticated user."""
        user = self._make_user()
        request = self.factory.get('/')
        request.user = user

        perm = FeatureGatePermission()
        perm.feature_code = None
        self.assertTrue(perm.has_permission(request, None))

    def test_user_with_feature_allowed(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.pro_plan, status='active')
        request = self.factory.get('/')
        request.user = user

        perm = FeatureGatePermission()
        perm.feature_code = 'sharing'
        self.assertTrue(perm.has_permission(request, None))

    def test_user_without_feature_denied(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        request = self.factory.get('/')
        request.user = user

        perm = FeatureGatePermission()
        perm.feature_code = 'sharing'
        self.assertFalse(perm.has_permission(request, None))


class FeatureRequiredFactoryTest(PermissionBaseTest):
    """Tests for the feature_required factory function."""

    def test_creates_class_with_correct_feature_code(self):
        PermClass = feature_required('sharing')
        self.assertEqual(PermClass.feature_code, 'sharing')

    def test_created_class_name(self):
        PermClass = feature_required('sharing')
        self.assertEqual(PermClass.__name__, 'FeatureGate_sharing')

    def test_permission_check_works(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.pro_plan, status='active')
        request = self.factory.get('/')
        request.user = user

        PermClass = feature_required('sharing')
        perm = PermClass()
        self.assertTrue(perm.has_permission(request, None))

    def test_permission_check_denies_without_feature(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        request = self.factory.get('/')
        request.user = user

        PermClass = feature_required('sharing')
        perm = PermClass()
        self.assertFalse(perm.has_permission(request, None))

    def test_different_features_produce_different_classes(self):
        Perm1 = feature_required('sharing')
        Perm2 = feature_required('analytics_export')
        self.assertNotEqual(Perm1.feature_code, Perm2.feature_code)
        self.assertEqual(Perm1.feature_code, 'sharing')
        self.assertEqual(Perm2.feature_code, 'analytics_export')

    def test_is_subclass_of_feature_gate_permission(self):
        PermClass = feature_required('sharing')
        self.assertTrue(issubclass(PermClass, FeatureGatePermission))
