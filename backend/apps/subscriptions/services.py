from django.db.models import Sum, Count, Max
from django.utils import timezone

from apps.subscriptions.models import Feature, Plan, Subscription


class SubscriptionService:
    """Single entry point for all subscription / feature-access checks."""

    # ------------------------------------------------------------------
    # Core: active plan resolution with lazy expiration
    # ------------------------------------------------------------------

    @staticmethod
    def get_active_plan(user) -> Plan:
        """Return user's active plan.  Lazy expiration check built in.

        1. Try user.subscription (DoesNotExist -> default plan).
        2. If status in (trial, active, cancelled) AND expired -> mark expired,
           reset to default plan, return default plan.
        3. If status == 'trial' -> return Plan with is_trial_reference=True.
        4. If status in (active, cancelled) -> return sub.plan.
        5. Fallback -> default plan.
        """
        default_plan = Plan.objects.filter(is_default=True).first()

        try:
            sub = user.subscription
        except Subscription.DoesNotExist:
            return default_plan

        # Lazy expiration
        if sub.status in ('trial', 'active', 'cancelled') and sub.expires_at <= timezone.now():
            sub.status = 'expired'
            sub.plan = default_plan
            sub.save(update_fields=['status', 'plan'])
            return default_plan

        if sub.status == 'trial':
            trial_plan = Plan.objects.filter(is_trial_reference=True).first()
            return trial_plan or default_plan

        if sub.status in ('active', 'cancelled'):
            return sub.plan

        # expired or any unexpected status
        return default_plan

    # ------------------------------------------------------------------
    # Feature gate
    # ------------------------------------------------------------------

    @staticmethod
    def has_feature(user, feature_code: str) -> bool:
        """Check if user's active plan includes the feature."""
        plan = SubscriptionService.get_active_plan(user)
        return plan.features.filter(code=feature_code).exists()

    # ------------------------------------------------------------------
    # Resource limits
    # ------------------------------------------------------------------

    @staticmethod
    def can_create_project(user) -> bool:
        """True if user hasn't hit the project limit. 0 = unlimited."""
        plan = SubscriptionService.get_active_plan(user)
        if plan.max_projects == 0:
            return True
        from apps.projects.models import Project  # lazy import
        return Project.objects.filter(user=user).count() < plan.max_projects

    @staticmethod
    def can_create_scene(user, project) -> bool:
        """True if project hasn't hit the scene limit. 0 = unlimited."""
        plan = SubscriptionService.get_active_plan(user)
        if plan.max_scenes_per_project == 0:
            return True
        from apps.scenes.models import Scene  # lazy import
        return Scene.objects.filter(project=project).count() < plan.max_scenes_per_project

    @staticmethod
    def check_storage(user) -> bool:
        """True if user can still upload/generate (storage not exceeded)."""
        plan = SubscriptionService.get_active_plan(user)
        if plan.storage_limit_gb == 0:
            return True
        from apps.elements.models import Element  # lazy import
        used = (
            Element.objects
            .filter(scene__project__user=user)
            .aggregate(total=Sum('file_size'))['total']
        ) or 0
        return used < plan.storage_limit_bytes

    # ------------------------------------------------------------------
    # Aggregated limits + usage (for serializers / frontend)
    # ------------------------------------------------------------------

    @staticmethod
    def get_limits(user) -> dict:
        """All limits + current usage.  Keys kept for backward compat."""
        plan = SubscriptionService.get_active_plan(user)

        # Lazy imports
        from apps.projects.models import Project
        from apps.scenes.models import Scene
        from apps.elements.models import Element

        used_projects = Project.objects.filter(user=user).count()

        # Max scenes in any single project
        max_scenes_used = (
            Scene.objects
            .filter(project__user=user)
            .values('project')
            .annotate(cnt=Count('id'))
            .aggregate(max_cnt=Max('cnt'))['max_cnt']
        ) or 0

        # Max elements in any single scene
        max_elements_used = (
            Element.objects
            .filter(scene__project__user=user)
            .values('scene')
            .annotate(cnt=Count('id'))
            .aggregate(max_cnt=Max('cnt'))['max_cnt']
        ) or 0

        storage_used = (
            Element.objects
            .filter(scene__project__user=user)
            .aggregate(total=Sum('file_size'))['total']
        ) or 0

        return {
            'max_projects': plan.max_projects,
            'used_projects': used_projects,
            'max_scenes_per_project': plan.max_scenes_per_project,
            'max_scenes_used': max_scenes_used,
            'max_elements_per_scene': plan.max_elements_per_scene,
            'max_elements_used': max_elements_used,
            'storage_limit_bytes': plan.storage_limit_bytes,
            'storage_used_bytes': storage_used,
        }

    # ------------------------------------------------------------------
    # Upgrade modal info
    # ------------------------------------------------------------------

    @staticmethod
    def get_feature_gate_info(feature_code: str) -> dict | None:
        """Return info dict for upgrade modal, or None if feature unknown."""
        try:
            feature = Feature.objects.select_related('min_plan').get(code=feature_code)
        except Feature.DoesNotExist:
            return None

        min_plan = feature.min_plan
        return {
            'code': feature.code,
            'title': feature.title,
            'description': feature.description,
            'icon': feature.icon,
            'min_plan_name': min_plan.name if min_plan else None,
            'min_plan_price': float(min_plan.price) if min_plan else None,
        }
