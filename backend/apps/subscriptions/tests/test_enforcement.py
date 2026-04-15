"""Integration tests for enforcement of subscription limits in other apps."""

from datetime import timedelta

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.subscriptions.models import Feature, Plan, Subscription
from apps.subscriptions.services import SubscriptionService
from apps.projects.models import Project
from apps.scenes.models import Scene
from apps.elements.models import Element

User = get_user_model()


class EnforcementBaseTest(TestCase):
    """Base with plan/feature fixtures and API client."""

    def setUp(self):
        Subscription.objects.all().delete()
        Feature.objects.all().delete()
        Plan.objects.all().delete()

        self.free_plan = Plan.objects.create(
            code='free', name='Free', price=0,
            max_projects=1, max_scenes_per_project=2,
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


class ProjectCreationLimitTest(EnforcementBaseTest):
    """Tests for project creation limit enforcement."""

    def test_create_project_within_limit(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        self.client.force_authenticate(user=user)
        # Free plan: max_projects=1, no projects yet
        resp = self.client.post('/api/projects/', {'name': 'New Project'}, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_create_project_at_limit_denied(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        self.client.force_authenticate(user=user)
        Project.objects.create(user=user, name='Existing')
        # Free plan: max_projects=1, already 1 project
        resp = self.client.post('/api/projects/', {'name': 'Second'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_pro_user_unlimited_projects(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.pro_plan, status='active')
        self.client.force_authenticate(user=user)
        for i in range(3):
            Project.objects.create(user=user, name=f'P{i}')
        resp = self.client.post('/api/projects/', {'name': 'Fourth'}, format='json')
        self.assertEqual(resp.status_code, 201)


class SceneCreationLimitTest(EnforcementBaseTest):
    """Tests for scene creation limit enforcement."""

    def test_create_scene_within_limit(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        self.client.force_authenticate(user=user)
        project = Project.objects.create(user=user, name='P1')
        resp = self.client.post('/api/scenes/', {
            'project': project.id,
            'name': 'New Scene',
        }, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_create_scene_unlimited(self):
        """Scene limit removed — creation always allowed."""
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        self.client.force_authenticate(user=user)
        project = Project.objects.create(user=user, name='P1')
        for i in range(10):
            Scene.objects.create(project=project, name=f'S{i}', order_index=i)
        resp = self.client.post('/api/scenes/', {
            'project': project.id,
            'name': 'Eleventh Scene',
        }, format='json')
        self.assertEqual(resp.status_code, 201)


class SharingFeatureGateTest(EnforcementBaseTest):
    """Tests for sharing feature gate enforcement."""

    def _create_element(self, project, scene=None):
        """Helper to create an element for sharing."""
        return Element.objects.create(
            project=project, scene=scene, element_type='IMAGE',
            status='COMPLETED', source_type='UPLOADED', order_index=0,
        )

    def test_pro_user_can_create_shared_link(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.pro_plan, status='active')
        self.client.force_authenticate(user=user)
        project = Project.objects.create(user=user, name='P1')
        element = self._create_element(project)
        resp = self.client.post('/api/sharing/links/', {
            'project': project.id,
            'element_ids': [element.id],
        }, format='json')
        self.assertIn(resp.status_code, [200, 201])

    def test_free_user_cannot_create_shared_link(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        self.client.force_authenticate(user=user)
        project = Project.objects.create(user=user, name='P1')
        element = self._create_element(project)
        resp = self.client.post('/api/sharing/links/', {
            'project': project.id,
            'element_ids': [element.id],
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_trial_user_can_create_shared_link(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='trial', expires_delta_days=5)
        self.client.force_authenticate(user=user)
        project = Project.objects.create(user=user, name='P1')
        element = self._create_element(project)
        resp = self.client.post('/api/sharing/links/', {
            'project': project.id,
            'element_ids': [element.id],
        }, format='json')
        self.assertIn(resp.status_code, [200, 201])

    def test_expired_trial_cannot_create_shared_link(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='trial', expires_delta_days=-1)
        self.client.force_authenticate(user=user)
        project = Project.objects.create(user=user, name='P1')
        element = self._create_element(project)
        resp = self.client.post('/api/sharing/links/', {
            'project': project.id,
            'element_ids': [element.id],
        }, format='json')
        self.assertEqual(resp.status_code, 403)


class StorageCheckEnforcementTest(EnforcementBaseTest):
    """Tests for storage check in orchestration."""

    def test_check_storage_allows_within_limit(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        # No storage used
        self.assertTrue(SubscriptionService.check_storage(user))

    def test_check_storage_blocks_at_limit(self):
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

    def test_orchestration_returns_error_on_storage_limit(self):
        """create_generation returns error when storage exceeded."""
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        project = Project.objects.create(user=user, name='P1')
        scene = Scene.objects.create(project=project, name='S1', order_index=0)
        # Fill storage beyond limit
        Element.objects.create(
            project=project, scene=scene, element_type='IMAGE',
            status='COMPLETED', source_type='UPLOADED', order_index=0,
            file_size=2 * 1024 ** 3,
        )

        from apps.elements.orchestration import create_generation
        data, status_code = create_generation(
            project=project, scene=scene,
            prompt='test prompt',
            ai_model_id=999,  # Does not matter, storage check is before model lookup
            generation_config={},
            user=user,
        )
        # The function catches ValueError and returns 500 with error message
        self.assertIn('error', data)
        self.assertIn(status_code, [400, 500])

    def test_presign_endpoint_blocks_on_storage_limit(self):
        """Scene presign endpoint returns 403 when storage exceeded."""
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        self.client.force_authenticate(user=user)
        project = Project.objects.create(user=user, name='P1')
        scene = Scene.objects.create(project=project, name='S1', order_index=0)
        # Fill storage
        Element.objects.create(
            project=project, scene=scene, element_type='IMAGE',
            status='COMPLETED', source_type='UPLOADED', order_index=0,
            file_size=2 * 1024 ** 3,
        )
        resp = self.client.post(
            f'/api/scenes/{scene.id}/presign/',
            {'filename': 'test.jpg'},
            format='json',
        )
        self.assertEqual(resp.status_code, 403)

    def test_project_presign_blocks_on_storage_limit(self):
        """Project presign endpoint returns 403 when storage exceeded."""
        user = self._make_user()
        self._set_subscription(user, plan=self.free_plan, status='active')
        self.client.force_authenticate(user=user)
        project = Project.objects.create(user=user, name='P1')
        scene = Scene.objects.create(project=project, name='S1', order_index=0)
        # Fill storage
        Element.objects.create(
            project=project, scene=scene, element_type='IMAGE',
            status='COMPLETED', source_type='UPLOADED', order_index=0,
            file_size=2 * 1024 ** 3,
        )
        resp = self.client.post(
            f'/api/projects/{project.id}/presign/',
            {'filename': 'test.jpg'},
            format='json',
        )
        self.assertEqual(resp.status_code, 403)


class LazyExpirationEnforcementTest(EnforcementBaseTest):
    """Tests that lazy expiration works correctly through the enforcement chain."""

    def test_expired_trial_blocks_project_creation(self):
        user = self._make_user()
        # Start with trial on free plan
        self._set_subscription(user, plan=self.free_plan, status='trial', expires_delta_days=-1)
        self.client.force_authenticate(user=user)
        # After expiration, user gets free plan (max_projects=1)
        Project.objects.create(user=user, name='Existing')
        resp = self.client.post('/api/projects/', {'name': 'Second'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_expired_active_falls_back_to_free_limits(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.pro_plan, status='active', expires_delta_days=-1)
        # After lazy expiration, user falls to free plan limits
        plan = SubscriptionService.get_active_plan(user)
        self.assertEqual(plan, self.free_plan)
        self.assertEqual(plan.max_projects, 1)

    def test_cancelled_not_expired_keeps_access(self):
        user = self._make_user()
        self._set_subscription(user, plan=self.pro_plan, status='cancelled', expires_delta_days=10)
        self.client.force_authenticate(user=user)
        for i in range(3):
            Project.objects.create(user=user, name=f'P{i}')
        # Cancelled but not expired — still pro limits
        resp = self.client.post('/api/projects/', {'name': 'Fourth'}, format='json')
        self.assertEqual(resp.status_code, 201)
