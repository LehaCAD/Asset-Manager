"""Tests for SubscriptionService — the most critical file."""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.subscriptions.models import Feature, Plan, Subscription
from apps.subscriptions.services import SubscriptionService
from apps.projects.models import Project
from apps.scenes.models import Scene
from apps.elements.models import Element

User = get_user_model()


class SubscriptionServiceBaseTest(TestCase):
    """Base class with plan/feature fixtures."""

    def setUp(self):
        # Clear seed data to avoid code conflicts
        Subscription.objects.all().delete()
        Feature.objects.all().delete()
        Plan.objects.all().delete()

        # Plans
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

        # Features
        self.sharing_feature = Feature.objects.create(
            code='sharing', title='Sharing', min_plan=self.pro_plan,
        )
        self.pro_plan.features.add(self.sharing_feature)
        # Free plan has no features

    def _make_user(self, username='testuser'):
        user = User.objects.create_user(
            username=username,
            email=f'{username}@test.com',
            password='testpass123',
        )
        return user

    def _set_subscription(self, user, *, plan=None, status='active', expires_delta_days=30):
        sub = user.subscription
        sub.plan = plan or self.free_plan
        sub.status = status
        sub.expires_at = timezone.now() + timedelta(days=expires_delta_days)
        sub.save()
        return sub


class GetActivePlanTest(SubscriptionServiceBaseTest):
    """Tests for SubscriptionService.get_active_plan."""

    def test_user_with_no_subscription_returns_default(self):
        """Edge case: user with deleted subscription -> default plan."""
        user = self._make_user()
        Subscription.objects.filter(user=user).delete()
        # Refetch from DB to clear cached reverse OneToOne
        user = User.objects.get(pk=user.pk)
        result = SubscriptionService.get_active_plan(user)
        self.assertEqual(result, self.free_plan)

    def test_user_with_active_subscription(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.pro_plan, status='active', expires_delta_days=30)
        result = SubscriptionService.get_active_plan(user)
        self.assertEqual(result, self.pro_plan)

    def test_user_with_trial_not_expired_returns_trial_reference(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='trial', expires_delta_days=5)
        result = SubscriptionService.get_active_plan(user)
        self.assertEqual(result, self.pro_plan)  # trial_reference plan

    def test_user_with_trial_expired_lazy_expires(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='trial', expires_delta_days=-1)
        result = SubscriptionService.get_active_plan(user)
        self.assertEqual(result, self.free_plan)
        # Verify subscription status was updated
        user.subscription.refresh_from_db()
        self.assertEqual(user.subscription.status, 'expired')

    def test_user_with_active_expired_lazy_expires(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.pro_plan, status='active', expires_delta_days=-1)
        result = SubscriptionService.get_active_plan(user)
        self.assertEqual(result, self.free_plan)
        user.subscription.refresh_from_db()
        self.assertEqual(user.subscription.status, 'expired')

    def test_user_with_cancelled_not_expired_returns_plan(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.pro_plan, status='cancelled', expires_delta_days=10)
        result = SubscriptionService.get_active_plan(user)
        self.assertEqual(result, self.pro_plan)

    def test_user_with_cancelled_expired_lazy_expires(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.pro_plan, status='cancelled', expires_delta_days=-5)
        result = SubscriptionService.get_active_plan(user)
        self.assertEqual(result, self.free_plan)
        user.subscription.refresh_from_db()
        self.assertEqual(user.subscription.status, 'expired')

    def test_user_with_expired_status_returns_default(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.pro_plan, status='expired', expires_delta_days=-10)
        result = SubscriptionService.get_active_plan(user)
        self.assertEqual(result, self.free_plan)

    def test_trial_without_trial_reference_plan_returns_default(self):
        """If no trial_reference plan exists, trial users get default plan."""
        self.pro_plan.is_trial_reference = False
        self.pro_plan.save()

        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='trial', expires_delta_days=5)
        result = SubscriptionService.get_active_plan(user)
        self.assertEqual(result, self.free_plan)

    def test_lazy_expiration_updates_plan_to_default(self):
        """Lazy expiration not only changes status but also plan to default."""
        user = self._make_user()
        self._set_subscription(user, plan=self.pro_plan, status='active', expires_delta_days=-1)
        SubscriptionService.get_active_plan(user)
        user.subscription.refresh_from_db()
        self.assertEqual(user.subscription.plan, self.free_plan)


class HasFeatureTest(SubscriptionServiceBaseTest):
    """Tests for SubscriptionService.has_feature."""

    def test_pro_user_has_sharing(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.pro_plan, status='active')
        self.assertTrue(SubscriptionService.has_feature(user, 'sharing'))

    def test_free_user_no_sharing(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        self.assertFalse(SubscriptionService.has_feature(user, 'sharing'))

    def test_trial_user_has_sharing(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='trial', expires_delta_days=5)
        self.assertTrue(SubscriptionService.has_feature(user, 'sharing'))

    def test_nonexistent_feature_returns_false(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.pro_plan, status='active')
        self.assertFalse(SubscriptionService.has_feature(user, 'nonexistent_feature'))

    def test_expired_trial_no_sharing(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='trial', expires_delta_days=-1)
        self.assertFalse(SubscriptionService.has_feature(user, 'sharing'))


class CanCreateProjectTest(SubscriptionServiceBaseTest):
    """Tests for SubscriptionService.can_create_project."""

    def test_under_limit(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        # Free plan: max_projects=1, user has 0 projects
        self.assertTrue(SubscriptionService.can_create_project(user))

    def test_at_limit(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        Project.objects.create(user=user, name='Project 1')
        # Free plan: max_projects=1, user has 1 project
        self.assertFalse(SubscriptionService.can_create_project(user))

    def test_unlimited_plan(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.pro_plan, status='active')
        # Pro plan: max_projects=0 (unlimited)
        for i in range(5):
            Project.objects.create(user=user, name=f'Project {i}')
        self.assertTrue(SubscriptionService.can_create_project(user))

    def test_over_limit_after_downgrade(self):
        user = self._make_user()
        # Create 3 projects as pro
        self._set_subscription(user, plan=self.pro_plan, status='active')
        for i in range(3):
            Project.objects.create(user=user, name=f'Project {i}')
        # Downgrade to free (max=1)
        self._set_subscription(user, plan=self.free_plan, status='active')
        self.assertFalse(SubscriptionService.can_create_project(user))


class CanCreateSceneTest(SubscriptionServiceBaseTest):
    """Tests for SubscriptionService.can_create_scene — always True (limit removed)."""

    def test_always_allowed(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        project = Project.objects.create(user=user, name='P1')
        self.assertTrue(SubscriptionService.can_create_scene(user, project))

    def test_allowed_even_with_many_scenes(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        project = Project.objects.create(user=user, name='P1')
        for i in range(100):
            Scene.objects.create(project=project, name=f'Scene {i}', order_index=i)
        self.assertTrue(SubscriptionService.can_create_scene(user, project))


class CheckStorageTest(SubscriptionServiceBaseTest):
    """Tests for SubscriptionService.check_storage."""

    def test_under_limit(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        project = Project.objects.create(user=user, name='P1')
        scene = Scene.objects.create(project=project, name='S1', order_index=0)
        # 500MB < 1GB
        Element.objects.create(
            project=project, scene=scene, element_type='IMAGE',
            status='COMPLETED', source_type='UPLOADED', order_index=0,
            file_size=500 * 1024 * 1024,
        )
        self.assertTrue(SubscriptionService.check_storage(user))

    def test_over_limit(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        project = Project.objects.create(user=user, name='P1')
        scene = Scene.objects.create(project=project, name='S1', order_index=0)
        # 2GB > 1GB limit
        Element.objects.create(
            project=project, scene=scene, element_type='IMAGE',
            status='COMPLETED', source_type='UPLOADED', order_index=0,
            file_size=2 * 1024 ** 3,
        )
        self.assertFalse(SubscriptionService.check_storage(user))

    def test_unlimited_storage(self):
        unlimited_plan = Plan.objects.create(
            code='unlimited', name='Unlimited', price=0,
            storage_limit_gb=0, display_order=10,
        )
        user = self._make_user()
        self._set_subscription(user, plan=unlimited_plan, status='active')
        project = Project.objects.create(user=user, name='P1')
        scene = Scene.objects.create(project=project, name='S1', order_index=0)
        Element.objects.create(
            project=project, scene=scene, element_type='IMAGE',
            status='COMPLETED', source_type='UPLOADED', order_index=0,
            file_size=500 * 1024 ** 3,
        )
        self.assertTrue(SubscriptionService.check_storage(user))

    def test_no_elements_under_limit(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        self.assertTrue(SubscriptionService.check_storage(user))

    def test_exactly_at_limit(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        project = Project.objects.create(user=user, name='P1')
        scene = Scene.objects.create(project=project, name='S1', order_index=0)
        # Exactly 1GB = 1GB limit -> not < so should be False
        Element.objects.create(
            project=project, scene=scene, element_type='IMAGE',
            status='COMPLETED', source_type='UPLOADED', order_index=0,
            file_size=1 * 1024 ** 3,
        )
        self.assertFalse(SubscriptionService.check_storage(user))

    def test_storage_across_multiple_projects(self):
        """Storage is aggregated across all user's projects."""
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        p1 = Project.objects.create(user=user, name='P1')
        p2 = Project.objects.create(user=user, name='P2')
        s1 = Scene.objects.create(project=p1, name='S1', order_index=0)
        s2 = Scene.objects.create(project=p2, name='S2', order_index=0)
        # 600MB + 600MB = 1.2GB > 1GB
        Element.objects.create(
            project=p1, scene=s1, element_type='IMAGE',
            status='COMPLETED', source_type='UPLOADED', order_index=0,
            file_size=600 * 1024 * 1024,
        )
        Element.objects.create(
            project=p2, scene=s2, element_type='IMAGE',
            status='COMPLETED', source_type='UPLOADED', order_index=0,
            file_size=600 * 1024 * 1024,
        )
        self.assertFalse(SubscriptionService.check_storage(user))


class GetLimitsTest(SubscriptionServiceBaseTest):
    """Tests for SubscriptionService.get_limits."""

    def test_returns_correct_keys(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        limits = SubscriptionService.get_limits(user)
        expected_keys = {
            'max_projects',
            'used_projects',
            'storage_limit_bytes',
            'storage_used_bytes',
        }
        self.assertEqual(set(limits.keys()), expected_keys)

    def test_values_match_db_state(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        project = Project.objects.create(user=user, name='P1')
        scene = Scene.objects.create(project=project, name='S1', order_index=0)
        Element.objects.create(
            project=project, scene=scene, element_type='IMAGE',
            status='COMPLETED', source_type='UPLOADED', order_index=0,
            file_size=100,
        )
        Element.objects.create(
            project=project, scene=scene, element_type='IMAGE',
            status='COMPLETED', source_type='UPLOADED', order_index=1,
            file_size=200,
        )

        limits = SubscriptionService.get_limits(user)

        self.assertEqual(limits['max_projects'], 1)
        self.assertEqual(limits['used_projects'], 1)
        self.assertEqual(limits['storage_limit_bytes'], 1 * 1024 ** 3)
        self.assertEqual(limits['storage_used_bytes'], 300)

    def test_empty_user_no_data(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        limits = SubscriptionService.get_limits(user)
        self.assertEqual(limits['used_projects'], 0)
        self.assertEqual(limits['storage_used_bytes'], 0)

    def test_multiple_projects_correct_max(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.pro_plan, status='active')
        p1 = Project.objects.create(user=user, name='P1')
        p2 = Project.objects.create(user=user, name='P2')
        # P1 has 3 scenes, P2 has 1 scene
        for i in range(3):
            Scene.objects.create(project=p1, name=f'S{i}', order_index=i)
        Scene.objects.create(project=p2, name='S0', order_index=0)

        limits = SubscriptionService.get_limits(user)
        self.assertEqual(limits['used_projects'], 2)


class GetFeatureGateInfoTest(SubscriptionServiceBaseTest):
    """Tests for SubscriptionService.get_feature_gate_info."""

    def test_existing_feature(self):
        info = SubscriptionService.get_feature_gate_info('sharing')
        self.assertIsNotNone(info)
        self.assertEqual(info['code'], 'sharing')
        self.assertEqual(info['title'], 'Sharing')
        self.assertEqual(info['min_plan_name'], 'Pro')
        self.assertEqual(info['min_plan_price'], 990.0)

    def test_nonexistent_feature(self):
        info = SubscriptionService.get_feature_gate_info('nonexistent')
        self.assertIsNone(info)

    def test_feature_without_min_plan(self):
        Feature.objects.create(code='no_plan', title='No Plan Feature', min_plan=None)
        info = SubscriptionService.get_feature_gate_info('no_plan')
        self.assertIsNotNone(info)
        self.assertIsNone(info['min_plan_name'])
        self.assertIsNone(info['min_plan_price'])
