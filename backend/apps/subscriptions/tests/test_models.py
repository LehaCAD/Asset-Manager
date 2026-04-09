"""Tests for subscriptions models: Plan, Feature, Subscription."""

from datetime import timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.utils import timezone

from apps.subscriptions.models import Feature, Plan, Subscription

User = get_user_model()


class PlanModelTest(TestCase):
    """Tests for the Plan model."""

    def setUp(self):
        # Clear seed data to avoid conflicts
        Feature.objects.all().delete()
        Plan.objects.all().delete()

    def _make_plan(self, **kwargs):
        defaults = {
            'code': 'test',
            'name': 'Test Plan',
            'price': 0,
            'max_projects': 1,
            'max_scenes_per_project': 10,
            'max_elements_per_scene': 10,
            'storage_limit_gb': 1,
            'display_order': 0,
        }
        defaults.update(kwargs)
        return Plan.objects.create(**defaults)

    # ---- storage_limit_bytes ----

    def test_storage_limit_bytes_normal(self):
        plan = self._make_plan(storage_limit_gb=5)
        self.assertEqual(plan.storage_limit_bytes, 5 * 1024 ** 3)

    def test_storage_limit_bytes_one(self):
        plan = self._make_plan(storage_limit_gb=1)
        self.assertEqual(plan.storage_limit_bytes, 1024 ** 3)

    def test_storage_limit_bytes_zero_means_unlimited(self):
        plan = self._make_plan(storage_limit_gb=0)
        self.assertEqual(plan.storage_limit_bytes, 0)

    # ---- save() enforces single is_default ----

    def test_save_enforces_single_is_default(self):
        plan1 = self._make_plan(code='p1', is_default=True)
        plan2 = self._make_plan(code='p2', is_default=True)
        plan1.refresh_from_db()
        self.assertFalse(plan1.is_default)
        self.assertTrue(plan2.is_default)

    def test_save_non_default_does_not_reset_others(self):
        plan1 = self._make_plan(code='p1', is_default=True)
        self._make_plan(code='p2', is_default=False)
        plan1.refresh_from_db()
        self.assertTrue(plan1.is_default)

    # ---- save() enforces single is_trial_reference ----

    def test_save_enforces_single_is_trial_reference(self):
        plan1 = self._make_plan(code='p1', is_trial_reference=True)
        plan2 = self._make_plan(code='p2', is_trial_reference=True)
        plan1.refresh_from_db()
        self.assertFalse(plan1.is_trial_reference)
        self.assertTrue(plan2.is_trial_reference)

    def test_save_non_trial_does_not_reset_others(self):
        plan1 = self._make_plan(code='p1', is_trial_reference=True)
        self._make_plan(code='p2', is_trial_reference=False)
        plan1.refresh_from_db()
        self.assertTrue(plan1.is_trial_reference)

    # ---- ordering ----

    def test_ordering_by_display_order(self):
        p3 = self._make_plan(code='p3', display_order=3)
        p1 = self._make_plan(code='p1', display_order=1)
        p2 = self._make_plan(code='p2', display_order=2)
        plans = list(Plan.objects.all())
        self.assertEqual(plans, [p1, p2, p3])

    # ---- __str__ ----

    def test_str_returns_name(self):
        plan = self._make_plan(name='My Plan')
        self.assertEqual(str(plan), 'My Plan')


class FeatureModelTest(TestCase):
    """Tests for the Feature model."""

    def setUp(self):
        Feature.objects.all().delete()
        Plan.objects.all().delete()

    def _make_plan(self, **kwargs):
        defaults = {
            'code': 'test_plan',
            'name': 'Test',
            'price': 0,
            'display_order': 0,
        }
        defaults.update(kwargs)
        return Plan.objects.create(**defaults)

    def test_str_returns_title(self):
        feat = Feature.objects.create(code='sharing', title='Sharing Feature')
        self.assertEqual(str(feat), 'Sharing Feature')

    def test_min_plan_set_null_on_delete(self):
        plan = self._make_plan()
        feat = Feature.objects.create(code='feat1', title='Feature 1', min_plan=plan)
        self.assertEqual(feat.min_plan, plan)

        plan.delete()
        feat.refresh_from_db()
        self.assertIsNone(feat.min_plan)

    def test_feature_ordering(self):
        f2 = Feature.objects.create(code='z_feature', title='Z')
        f1 = Feature.objects.create(code='a_feature', title='A')
        features = list(Feature.objects.all())
        self.assertEqual(features, [f1, f2])

    def test_feature_code_unique(self):
        Feature.objects.create(code='unique_code', title='First')
        with self.assertRaises(IntegrityError):
            Feature.objects.create(code='unique_code', title='Duplicate')


class SubscriptionModelTest(TestCase):
    """Tests for the Subscription model."""

    def setUp(self):
        # Clear seed data, then create our own plans
        Subscription.objects.all().delete()
        Feature.objects.all().delete()
        Plan.objects.all().delete()

        self.default_plan = Plan.objects.create(
            code='free', name='Free', price=0, is_default=True, display_order=0,
        )
        self.pro_plan = Plan.objects.create(
            code='pro', name='Pro', price=990, display_order=1,
        )

    def _make_user(self, username='testuser', **kwargs):
        return User.objects.create_user(
            username=username,
            email=f'{username}@test.com',
            password='testpass123',
            **kwargs,
        )

    # ---- is_trial property ----

    def test_is_trial_true_when_trial_and_not_expired(self):
        user = self._make_user()
        sub = user.subscription
        sub.status = 'trial'
        sub.expires_at = timezone.now() + timedelta(days=5)
        sub.save()
        self.assertTrue(sub.is_trial)

    def test_is_trial_false_when_trial_but_expired(self):
        user = self._make_user()
        sub = user.subscription
        sub.status = 'trial'
        sub.expires_at = timezone.now() - timedelta(days=1)
        sub.save()
        self.assertFalse(sub.is_trial)

    def test_is_trial_false_when_active(self):
        user = self._make_user()
        sub = user.subscription
        sub.status = 'active'
        sub.expires_at = timezone.now() + timedelta(days=30)
        sub.save()
        self.assertFalse(sub.is_trial)

    # ---- trial_days_left property ----

    def test_trial_days_left_correct_value(self):
        user = self._make_user()
        sub = user.subscription
        sub.status = 'trial'
        sub.expires_at = timezone.now() + timedelta(days=5, hours=12)
        sub.save()
        self.assertEqual(sub.trial_days_left, 5)

    def test_trial_days_left_zero_when_expired(self):
        user = self._make_user()
        sub = user.subscription
        sub.status = 'trial'
        sub.expires_at = timezone.now() - timedelta(hours=5)
        sub.save()
        self.assertEqual(sub.trial_days_left, 0)

    def test_trial_days_left_none_when_not_trial(self):
        user = self._make_user()
        sub = user.subscription
        sub.status = 'active'
        sub.expires_at = timezone.now() + timedelta(days=30)
        sub.save()
        self.assertIsNone(sub.trial_days_left)

    # ---- status choices ----

    def test_status_choices(self):
        valid = {'active', 'trial', 'expired', 'cancelled'}
        choices = {c[0] for c in Subscription.STATUS_CHOICES}
        self.assertEqual(choices, valid)

    # ---- OneToOne constraint ----

    def test_one_subscription_per_user(self):
        user = self._make_user()
        # User already has a subscription from post_save signal
        self.assertTrue(Subscription.objects.filter(user=user).exists())
        with self.assertRaises(IntegrityError):
            Subscription.objects.create(
                user=user,
                plan=self.pro_plan,
                status='active',
                expires_at=timezone.now() + timedelta(days=30),
            )

    # ---- __str__ ----

    def test_str_format(self):
        user = self._make_user()
        sub = user.subscription
        result = str(sub)
        self.assertIn(user.username, result)
        self.assertIn(sub.plan.name, result)
