# Subscription & Feature Gating — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement subscription plans with feature gating, trial system, and Django admin management so users see upgrade prompts on locked features.

**Architecture:** New `subscriptions` Django app with Plan/Feature/Subscription models. SubscriptionService as single entry point for all access checks. Frontend `useSubscriptionStore` + `<UpgradeModal>` component. UserQuota removed — quota computed from Plan.

**Tech Stack:** Django 5, DRF, Celery (existing), Next.js 14, Zustand 5, Tailwind 4, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-08-subscription-feature-gating-design.md`

---

## File Map

### New files (backend)
- `backend/apps/subscriptions/__init__.py`
- `backend/apps/subscriptions/apps.py`
- `backend/apps/subscriptions/models.py` — Plan, Feature, Subscription
- `backend/apps/subscriptions/services.py` — SubscriptionService
- `backend/apps/subscriptions/permissions.py` — FeatureGatePermission
- `backend/apps/subscriptions/serializers.py` — Plan, Feature, Subscription serializers
- `backend/apps/subscriptions/views.py` — Plans list, feature-gate info
- `backend/apps/subscriptions/urls.py`
- `backend/apps/subscriptions/admin.py` — PlanAdmin, FeatureAdmin, SubscriptionAdmin
- `backend/apps/subscriptions/admin_forms.py` — Custom admin forms
- `backend/apps/subscriptions/migrations/0001_initial.py` — Schema
- `backend/apps/subscriptions/migrations/0002_seed_plans.py` — Seed data
- `backend/apps/subscriptions/migrations/0003_migrate_users.py` — Create subscriptions for existing users
- `backend/apps/subscriptions/management/commands/seed_plans.py` — Idempotent seed command
- `backend/templates/admin/subscriptions/plan/change_form.html` — Custom admin template
- `backend/static/admin/subscriptions/subscriptions_admin.css` — Admin styling

### New files (frontend)
- `frontend/lib/store/subscription.ts` — useSubscriptionStore
- `frontend/lib/api/subscriptions.ts` — API client
- `frontend/components/subscription/UpgradeModal.tsx` — Upgrade modal
- `frontend/components/subscription/FeatureGate.tsx` — Wrapper component
- `frontend/components/subscription/ProBadge.tsx` — PRO badge
- `frontend/components/subscription/LimitBar.tsx` — Progress bar for limits
- `frontend/components/subscription/TrialBanner.tsx` — Header trial text
- `frontend/app/(workspace)/pricing/page.tsx` — Pricing stub page

### Modified files (backend)
- `backend/config/settings.py:57` — Add `'apps.subscriptions'` to INSTALLED_APPS
- `backend/config/urls.py:34` — Add subscriptions URL include
- `backend/apps/users/models.py:59-108` — Remove UserQuota model and signal
- `backend/apps/users/admin.py:117-123` — Remove UserQuotaAdmin
- `backend/apps/users/serializers.py:61-106` — Rewrite get_quota() from subscription.plan, add subscription field
- `backend/apps/users/views.py` — Add select_related for subscription
- `backend/apps/projects/views.py:80-87` — Uncomment and rewrite quota check
- `backend/apps/scenes/views.py:178-186` — Uncomment and rewrite quota check
- `backend/apps/sharing/views.py:43-48` — Add feature gate
- `backend/apps/elements/orchestration.py:24` — Add storage check to create_generation
- `backend/apps/cabinet/services.py:316,344` — Read limits from subscription.plan

### Modified files (frontend)
- `frontend/lib/types/index.ts:3-9` — Add subscription fields to User type
- `frontend/lib/store/auth.ts` — Sync subscription data on login
- `frontend/components/layout/Navbar.tsx:172-200` — Purple progress bar + trial banner

---

## Task 1: Create subscriptions app with models

**Files:**
- Create: `backend/apps/subscriptions/__init__.py`
- Create: `backend/apps/subscriptions/apps.py`
- Create: `backend/apps/subscriptions/models.py`
- Modify: `backend/config/settings.py:57`

- [ ] **Step 1: Create app directory and boilerplate**

```bash
docker compose exec backend python -c "
import os
os.makedirs('apps/subscriptions', exist_ok=True)
for f in ['__init__.py']:
    open(f'apps/subscriptions/{f}', 'w').close()
print('done')
"
```

- [ ] **Step 2: Write apps.py**

```python
# backend/apps/subscriptions/apps.py
from django.apps import AppConfig

class SubscriptionsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.subscriptions'
    verbose_name = 'Подписки и тарифы'
```

- [ ] **Step 3: Write models.py — Plan, Feature, Subscription**

```python
# backend/apps/subscriptions/models.py
from django.conf import settings
from django.db import models
from django.utils import timezone


class Plan(models.Model):
    """Тарифный план."""
    code = models.CharField(max_length=50, unique=True, help_text='Идентификатор в коде (free, creator, creator_pro...)')
    name = models.CharField(max_length=100, help_text='Название для пользователя')
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text='Цена ₽/мес')
    credits_per_month = models.IntegerField(default=0, help_text='Кадров при автоматической оплате (0 = не начисляются)')

    # Лимиты (0 = безлимит)
    max_projects = models.IntegerField(default=1, help_text='0 = безлимит')
    max_scenes_per_project = models.IntegerField(default=10, help_text='0 = безлимит')
    max_elements_per_scene = models.IntegerField(default=10, help_text='0 = безлимит')
    storage_limit_gb = models.IntegerField(default=1, help_text='0 = безлимит')

    # Фичи
    features = models.ManyToManyField('Feature', blank=True, related_name='plans')

    # Флаги
    is_default = models.BooleanField(default=False, help_text='Тариф по умолчанию для новых пользователей (только один)')
    is_recommended = models.BooleanField(default=False, help_text='Подсвечивается на странице тарифов')
    is_trial_reference = models.BooleanField(default=False, help_text='Используется как план во время триала (только один)')
    is_active = models.BooleanField(default=True, help_text='Отображается на фронтенде')

    display_order = models.IntegerField(default=0, help_text='Порядок на странице тарифов')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_order']
        verbose_name = 'Тарифный план'
        verbose_name_plural = 'Тарифные планы'

    def __str__(self):
        return self.name

    @property
    def storage_limit_bytes(self):
        """Для обратной совместимости с UserQuota формат."""
        if self.storage_limit_gb == 0:
            return 0  # безлимит
        return self.storage_limit_gb * 1024 * 1024 * 1024

    def save(self, *args, **kwargs):
        # Enforce only one is_default
        if self.is_default:
            Plan.objects.filter(is_default=True).exclude(pk=self.pk).update(is_default=False)
        if self.is_trial_reference:
            Plan.objects.filter(is_trial_reference=True).exclude(pk=self.pk).update(is_trial_reference=False)
        super().save(*args, **kwargs)


class Feature(models.Model):
    """Бинарная фича, привязанная к тарифам."""
    code = models.CharField(max_length=50, unique=True, help_text='Идентификатор в коде')
    title = models.CharField(max_length=200, help_text='Заголовок в модалке апгрейда')
    description = models.TextField(help_text='Описание в модалке (1-2 предложения)')
    icon = models.CharField(max_length=50, help_text='Имя иконки Lucide')
    min_plan = models.ForeignKey(Plan, on_delete=models.SET_NULL, null=True, blank=True,
                                  related_name='min_plan_features',
                                  help_text='Минимальный тариф для лейбла «Доступно начиная с...»')

    class Meta:
        ordering = ['code']
        verbose_name = 'Фича'
        verbose_name_plural = 'Фичи'

    def __str__(self):
        return self.title


class Subscription(models.Model):
    """Подписка пользователя на тарифный план."""
    STATUS_CHOICES = [
        ('active', 'Активна'),
        ('trial', 'Триал'),
        ('expired', 'Истекла'),
        ('cancelled', 'Отменена'),
    ]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='subscription')
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name='subscriptions')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='trial')
    started_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Подписка'
        verbose_name_plural = 'Подписки'

    def __str__(self):
        return f'{self.user} → {self.plan.name} ({self.get_status_display()})'

    @property
    def is_trial(self):
        return self.status == 'trial' and self.expires_at > timezone.now()

    @property
    def trial_days_left(self):
        if not self.is_trial:
            return None
        delta = self.expires_at - timezone.now()
        return max(0, delta.days)
```

- [ ] **Step 4: Add to INSTALLED_APPS**

In `backend/config/settings.py`, add `'apps.subscriptions'` after `'apps.cabinet'` in INSTALLED_APPS.

- [ ] **Step 5: Create and run migration**

```bash
docker compose exec backend python manage.py makemigrations subscriptions
docker compose exec backend python manage.py migrate
```

- [ ] **Step 6: Commit**

```bash
git add backend/apps/subscriptions/ backend/config/settings.py
git commit -m "feat(subscriptions): add Plan, Feature, Subscription models"
```

---

## Task 2: Seed data migration

**Files:**
- Create: `backend/apps/subscriptions/migrations/0002_seed_plans.py`
- Create: `backend/apps/subscriptions/management/__init__.py`
- Create: `backend/apps/subscriptions/management/commands/__init__.py`
- Create: `backend/apps/subscriptions/management/commands/seed_plans.py`

- [ ] **Step 1: Write seed data migration**

Create `backend/apps/subscriptions/migrations/0002_seed_plans.py`:

```python
from django.db import migrations


def seed_plans(apps, schema_editor):
    Plan = apps.get_model('subscriptions', 'Plan')
    Feature = apps.get_model('subscriptions', 'Feature')

    # Create plans
    plans_data = [
        {'code': 'free', 'name': 'Старт', 'price': 0, 'credits_per_month': 0,
         'max_projects': 1, 'max_scenes_per_project': 10, 'max_elements_per_scene': 10,
         'storage_limit_gb': 1, 'is_default': True, 'display_order': 1},
        {'code': 'creator', 'name': 'Создатель', 'price': 990, 'credits_per_month': 1000,
         'max_projects': 5, 'max_scenes_per_project': 20, 'max_elements_per_scene': 20,
         'storage_limit_gb': 20, 'display_order': 2},
        {'code': 'creator_pro', 'name': 'Создатель Pro', 'price': 1990, 'credits_per_month': 2000,
         'max_projects': 0, 'max_scenes_per_project': 50, 'max_elements_per_scene': 50,
         'storage_limit_gb': 100, 'is_recommended': True, 'is_trial_reference': True, 'display_order': 3},
        {'code': 'team', 'name': 'Команда', 'price': 4990, 'credits_per_month': 5000,
         'max_projects': 0, 'max_scenes_per_project': 100, 'max_elements_per_scene': 100,
         'storage_limit_gb': 500, 'display_order': 4},
        {'code': 'enterprise', 'name': 'Корпоративный', 'price': 0, 'credits_per_month': 0,
         'max_projects': 0, 'max_scenes_per_project': 0, 'max_elements_per_scene': 0,
         'storage_limit_gb': 0, 'is_active': False, 'display_order': 5},
    ]
    plan_objects = {}
    for data in plans_data:
        plan, _ = Plan.objects.update_or_create(code=data.pop('code'), defaults=data)
        plan_objects[plan.code] = plan

    # Create features (without min_plan first — circular dep)
    features_data = [
        {'code': 'sharing', 'title': 'Доступ по ссылке',
         'description': 'Делитесь проектами с клиентами и коллегами. Комментарии и ревью прямо в Раскадровке.',
         'icon': 'link'},
        {'code': 'batch_download', 'title': 'Массовое скачивание',
         'description': 'Скачайте все элементы проекта или группы одним архивом.',
         'icon': 'download'},
        {'code': 'ai_prompt', 'title': 'Усиление промпта',
         'description': 'Нейросеть улучшит ваш промпт для более точной и качественной генерации.',
         'icon': 'sparkles'},
        {'code': 'analytics_export', 'title': 'Экспорт аналитики',
         'description': 'Выгружайте данные аналитики в удобном формате для отчётов.',
         'icon': 'file-spreadsheet'},
    ]
    feature_min_plans = {
        'sharing': 'creator',
        'batch_download': 'creator_pro',
        'ai_prompt': 'creator_pro',
        'analytics_export': 'team',
    }
    for data in features_data:
        feature, _ = Feature.objects.update_or_create(code=data['code'], defaults=data)
        feature.min_plan = plan_objects[feature_min_plans[feature.code]]
        feature.save()

    # Assign features to plans
    plan_objects['creator'].features.set(
        Feature.objects.filter(code='sharing'))
    plan_objects['creator_pro'].features.set(
        Feature.objects.filter(code__in=['sharing', 'batch_download', 'ai_prompt']))
    plan_objects['team'].features.set(
        Feature.objects.filter(code__in=['sharing', 'batch_download', 'ai_prompt', 'analytics_export']))
    plan_objects['enterprise'].features.set(Feature.objects.all())


def reverse_seed(apps, schema_editor):
    Plan = apps.get_model('subscriptions', 'Plan')
    Feature = apps.get_model('subscriptions', 'Feature')
    Feature.objects.all().delete()
    Plan.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ('subscriptions', '0001_initial'),
    ]
    operations = [
        migrations.RunPython(seed_plans, reverse_seed),
    ]
```

- [ ] **Step 2: Write seed_plans management command**

Create directory structure and `backend/apps/subscriptions/management/commands/seed_plans.py` — same logic as migration but callable via `python manage.py seed_plans`. Idempotent (uses `update_or_create`).

- [ ] **Step 3: Run migration**

```bash
docker compose exec backend python manage.py migrate subscriptions
```

- [ ] **Step 4: Verify in Django shell**

```bash
docker compose exec backend python manage.py shell -c "
from apps.subscriptions.models import Plan, Feature
print('Plans:', list(Plan.objects.values_list('code', 'name')))
print('Features:', list(Feature.objects.values_list('code', 'title')))
pro = Plan.objects.get(code='creator_pro')
print('Pro features:', list(pro.features.values_list('code', flat=True)))
print('Default:', Plan.objects.get(is_default=True).name)
print('Trial ref:', Plan.objects.get(is_trial_reference=True).name)
"
```

- [ ] **Step 5: Commit**

```bash
git add backend/apps/subscriptions/
git commit -m "feat(subscriptions): seed plans and features data"
```

---

## Task 3: SubscriptionService

**Files:**
- Create: `backend/apps/subscriptions/services.py`

- [ ] **Step 1: Write SubscriptionService**

```python
# backend/apps/subscriptions/services.py
from django.utils import timezone
from django.db.models import Sum

from .models import Plan, Feature, Subscription


class SubscriptionService:
    """Единая точка входа для всех проверок подписок и фич."""

    @staticmethod
    def get_active_plan(user) -> Plan:
        """Текущий активный план пользователя.
        Ленивая проверка истечения — если подписка истекла, обновляет статус."""
        try:
            sub = user.subscription
        except Subscription.DoesNotExist:
            return Plan.objects.get(is_default=True)

        # Ленивая проверка истечения
        if sub.status in ('trial', 'active', 'cancelled') and sub.expires_at <= timezone.now():
            default_plan = Plan.objects.get(is_default=True)
            sub.status = 'expired'
            sub.plan = default_plan
            sub.save(update_fields=['status', 'plan'])
            return default_plan

        if sub.status == 'trial':
            return Plan.objects.get(is_trial_reference=True)

        if sub.status in ('active', 'cancelled'):
            return sub.plan

        # expired or unknown
        return Plan.objects.get(is_default=True)

    @staticmethod
    def has_feature(user, feature_code: str) -> bool:
        """Проверяет, есть ли у пользователя фича."""
        plan = SubscriptionService.get_active_plan(user)
        return plan.features.filter(code=feature_code).exists()

    @staticmethod
    def can_create_project(user) -> bool:
        plan = SubscriptionService.get_active_plan(user)
        if plan.max_projects == 0:
            return True
        from apps.projects.models import Project
        current = Project.objects.filter(user=user).count()
        return current < plan.max_projects

    @staticmethod
    def can_create_scene(user, project) -> bool:
        plan = SubscriptionService.get_active_plan(user)
        if plan.max_scenes_per_project == 0:
            return True
        from apps.scenes.models import Scene
        current = Scene.objects.filter(project=project).count()
        return current < plan.max_scenes_per_project

    @staticmethod
    def check_storage(user) -> bool:
        """True если можно ещё загружать/генерить."""
        plan = SubscriptionService.get_active_plan(user)
        if plan.storage_limit_gb == 0:
            return True
        from apps.elements.models import Element
        used = Element.objects.filter(
            scene__project__user=user
        ).aggregate(total=Sum('file_size'))['total'] or 0
        return used < plan.storage_limit_bytes

    @staticmethod
    def get_limits(user) -> dict:
        """Все лимиты + текущее использование. Для сериализатора."""
        plan = SubscriptionService.get_active_plan(user)

        from apps.projects.models import Project
        from apps.scenes.models import Scene
        from apps.elements.models import Element

        used_projects = Project.objects.filter(user=user).count()
        # Max scenes used across all projects
        from django.db.models import Count
        max_scenes_used = Scene.objects.filter(project__user=user).values('project').annotate(
            cnt=Count('id')).order_by('-cnt').values_list('cnt', flat=True).first() or 0
        # Max elements used across all scenes
        max_elements_used = Element.objects.filter(scene__project__user=user).values('scene').annotate(
            cnt=Count('id')).order_by('-cnt').values_list('cnt', flat=True).first() or 0
        used_storage = Element.objects.filter(
            scene__project__user=user
        ).aggregate(total=Sum('file_size'))['total'] or 0

        return {
            'max_projects': plan.max_projects,
            'used_projects': used_projects,
            'max_scenes_per_project': plan.max_scenes_per_project,
            'max_scenes_used': max_scenes_used,
            'max_elements_per_scene': plan.max_elements_per_scene,
            'max_elements_used': max_elements_used,
            'storage_limit_bytes': plan.storage_limit_bytes,
            'storage_used_bytes': used_storage,
        }

    @staticmethod
    def get_feature_gate_info(feature_code: str) -> dict | None:
        """Инфо для модалки апгрейда."""
        try:
            feature = Feature.objects.select_related('min_plan').get(code=feature_code)
        except Feature.DoesNotExist:
            return None
        return {
            'code': feature.code,
            'title': feature.title,
            'description': feature.description,
            'icon': feature.icon,
            'min_plan_name': feature.min_plan.name if feature.min_plan else None,
            'min_plan_price': float(feature.min_plan.price) if feature.min_plan else None,
        }
```

- [ ] **Step 2: Verify in shell**

```bash
docker compose exec backend python manage.py shell -c "
from apps.users.models import User
from apps.subscriptions.services import SubscriptionService
user = User.objects.first()
plan = SubscriptionService.get_active_plan(user)
print('Plan:', plan.name)
print('Has sharing:', SubscriptionService.has_feature(user, 'sharing'))
print('Limits:', SubscriptionService.get_limits(user))
"
```

- [ ] **Step 3: Commit**

```bash
git add backend/apps/subscriptions/services.py
git commit -m "feat(subscriptions): add SubscriptionService with all access checks"
```

---

## Task 4: Migrate existing users + create subscriptions on registration

**Files:**
- Create: `backend/apps/subscriptions/migrations/0003_migrate_users.py`
- Modify: `backend/apps/users/models.py:104-108` — Change signal to create Subscription instead of UserQuota

- [ ] **Step 1: Write user migration**

Create `backend/apps/subscriptions/migrations/0003_migrate_users.py`:

```python
from django.db import migrations
from django.utils import timezone
from datetime import timedelta


def create_subscriptions(apps, schema_editor):
    User = apps.get_model('users', 'User')
    Plan = apps.get_model('subscriptions', 'Plan')
    Subscription = apps.get_model('subscriptions', 'Subscription')

    default_plan = Plan.objects.get(is_default=True)
    now = timezone.now()

    for user in User.objects.all():
        if not Subscription.objects.filter(user=user).exists():
            Subscription.objects.create(
                user=user,
                plan=default_plan,
                status='active',
                started_at=user.created_at or now,
                expires_at=now + timedelta(days=365 * 10),  # Существующие юзеры — без ограничения срока
            )


def reverse(apps, schema_editor):
    Subscription = apps.get_model('subscriptions', 'Subscription')
    Subscription.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ('subscriptions', '0002_seed_plans'),
        ('users', '__latest__'),
    ]
    operations = [
        migrations.RunPython(create_subscriptions, reverse),
    ]
```

- [ ] **Step 2: Update user post_save signal**

In `backend/apps/users/models.py`, modify the signal (lines 104-108) to also create a Subscription:

```python
@receiver(post_save, sender=User)
def create_user_quota(sender, instance, created, **kwargs):
    """Create UserQuota and trial Subscription for new users."""
    if created:
        UserQuota.objects.create(user=instance)
        # Create trial subscription
        from apps.subscriptions.models import Plan, Subscription
        from apps.credits.services import CreditsService
        from decimal import Decimal
        default_plan = Plan.objects.filter(is_default=True).first()
        if default_plan:
            Subscription.objects.create(
                user=instance,
                plan=default_plan,
                status='trial',
                expires_at=timezone.now() + timedelta(days=7),
            )
            # Trial bonus credits
            CreditsService().topup(
                instance,
                Decimal('50'),
                reason='trial_bonus',
                metadata={'source': 'registration_trial'},
            )
```

Add imports at top: `from datetime import timedelta`

Also add `REASON_TRIAL_BONUS = 'trial_bonus'` to `CreditsTransaction.REASON_CHOICES` in `backend/apps/credits/models.py`.

Note: UserQuota creation stays temporarily — will be removed in Task 7 after serializer is updated.

- [ ] **Step 3: Run migration**

```bash
docker compose exec backend python manage.py migrate subscriptions
```

- [ ] **Step 4: Verify**

```bash
docker compose exec backend python manage.py shell -c "
from apps.subscriptions.models import Subscription
print('Subscriptions:', Subscription.objects.count())
print('First:', Subscription.objects.first())
"
```

- [ ] **Step 5: Commit**

```bash
git add backend/apps/subscriptions/migrations/ backend/apps/users/models.py
git commit -m "feat(subscriptions): migrate existing users, create trial on registration"
```

---

## Task 5: DRF permissions, serializers, API endpoints

**Files:**
- Create: `backend/apps/subscriptions/permissions.py`
- Create: `backend/apps/subscriptions/serializers.py`
- Create: `backend/apps/subscriptions/views.py`
- Create: `backend/apps/subscriptions/urls.py`
- Modify: `backend/config/urls.py:34`

- [ ] **Step 1: Write FeatureGatePermission**

```python
# backend/apps/subscriptions/permissions.py
from rest_framework.permissions import BasePermission
from .services import SubscriptionService


class FeatureGatePermission(BasePermission):
    """DRF permission that checks if user has a specific feature."""
    feature_code = None

    def __init__(self, feature_code=None):
        if feature_code:
            self.feature_code = feature_code

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if not self.feature_code:
            return True
        return SubscriptionService.has_feature(request.user, self.feature_code)


def feature_required(feature_code):
    """Factory for creating feature gate permissions."""
    class _Permission(FeatureGatePermission):
        pass
    _Permission.feature_code = feature_code
    _Permission.__name__ = f'FeatureGate_{feature_code}'
    return _Permission
```

- [ ] **Step 2: Write serializers**

```python
# backend/apps/subscriptions/serializers.py
from rest_framework import serializers
from .models import Plan, Feature, Subscription


class FeatureSerializer(serializers.ModelSerializer):
    class Meta:
        model = Feature
        fields = ['code', 'title', 'description', 'icon']


class PlanListSerializer(serializers.ModelSerializer):
    features = FeatureSerializer(many=True, read_only=True)

    class Meta:
        model = Plan
        fields = ['code', 'name', 'price', 'credits_per_month',
                  'max_projects', 'max_scenes_per_project', 'max_elements_per_scene',
                  'storage_limit_gb', 'features', 'is_recommended', 'display_order']


class SubscriptionSerializer(serializers.ModelSerializer):
    plan_code = serializers.CharField(source='plan.code', read_only=True)
    plan_name = serializers.CharField(source='plan.name', read_only=True)
    features = serializers.SerializerMethodField()
    is_trial = serializers.BooleanField(read_only=True)
    trial_days_left = serializers.IntegerField(read_only=True)

    class Meta:
        model = Subscription
        fields = ['plan_code', 'plan_name', 'status', 'expires_at',
                  'features', 'is_trial', 'trial_days_left']

    def get_features(self, obj):
        from .services import SubscriptionService
        plan = SubscriptionService.get_active_plan(obj.user)
        return list(plan.features.values_list('code', flat=True))


class FeatureGateSerializer(serializers.Serializer):
    code = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField()
    icon = serializers.CharField()
    min_plan_name = serializers.CharField()
    min_plan_price = serializers.FloatField()
```

- [ ] **Step 3: Write views and urls**

```python
# backend/apps/subscriptions/views.py
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Plan
from .serializers import PlanListSerializer, FeatureGateSerializer
from .services import SubscriptionService


class PlanListView(generics.ListAPIView):
    """GET /api/subscriptions/plans/ — список тарифов для страницы /pricing."""
    serializer_class = PlanListSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        return Plan.objects.filter(is_active=True).prefetch_related('features')


class FeatureGateView(APIView):
    """GET /api/subscriptions/feature-gate/<code>/ — инфо для модалки апгрейда."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, code):
        info = SubscriptionService.get_feature_gate_info(code)
        if not info:
            return Response({'detail': 'Feature not found'}, status=404)
        return Response(FeatureGateSerializer(info).data)
```

```python
# backend/apps/subscriptions/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('plans/', views.PlanListView.as_view(), name='plan-list'),
    path('feature-gate/<str:code>/', views.FeatureGateView.as_view(), name='feature-gate'),
]
```

- [ ] **Step 4: Add URL to config**

In `backend/config/urls.py`, add:
```python
path('api/subscriptions/', include('apps.subscriptions.urls')),
```

- [ ] **Step 5: Test endpoints**

```bash
docker compose exec backend python manage.py shell -c "
from django.test import RequestFactory
from apps.subscriptions.views import PlanListView
rf = RequestFactory()
request = rf.get('/api/subscriptions/plans/')
response = PlanListView.as_view()(request)
print('Plans:', len(response.data))
"
```

- [ ] **Step 6: Commit**

```bash
git add backend/apps/subscriptions/permissions.py backend/apps/subscriptions/serializers.py backend/apps/subscriptions/views.py backend/apps/subscriptions/urls.py backend/config/urls.py
git commit -m "feat(subscriptions): add API endpoints, permissions, serializers"
```

---

## Task 6: Backend enforcement — wire up access checks

**Files:**
- Modify: `backend/apps/projects/views.py:80-87`
- Modify: `backend/apps/scenes/views.py:178-186`
- Modify: `backend/apps/sharing/views.py:43-48`
- Modify: `backend/apps/elements/orchestration.py`

- [ ] **Step 1: Add project creation limit**

In `backend/apps/projects/views.py`, replace the commented-out quota check (lines 80-87) with:

```python
from apps.subscriptions.services import SubscriptionService

# Check project limit
if not SubscriptionService.can_create_project(user):
    plan = SubscriptionService.get_active_plan(user)
    raise PermissionDenied(
        f'Достигнут лимит проектов ({plan.max_projects}). Перейдите на другой тариф для увеличения.'
    )
```

- [ ] **Step 2: Add scene creation limit**

In `backend/apps/scenes/views.py`, replace the commented-out quota check (lines 178-186) with:

```python
from apps.subscriptions.services import SubscriptionService

# Check scene limit
if not SubscriptionService.can_create_scene(request.user, project):
    plan = SubscriptionService.get_active_plan(request.user)
    return Response(
        {'detail': f'Достигнут лимит групп в проекте ({plan.max_scenes_per_project}). Перейдите на другой тариф.'},
        status=status.HTTP_403_FORBIDDEN
    )
```

- [ ] **Step 3: Add sharing feature gate**

In `backend/apps/sharing/views.py`, add to `SharedLinkViewSet`:

```python
from apps.subscriptions.permissions import feature_required

class SharedLinkViewSet(viewsets.ModelViewSet):
    # Override get_permissions, preserving existing IsProjectOwner:
    def get_permissions(self):
        if self.action == 'create':
            return [IsAuthenticated(), IsProjectOwner(), feature_required('sharing')()]
        return [IsAuthenticated(), IsProjectOwner()]
```

- [ ] **Step 4: Add storage check to generation/upload**

In `backend/apps/elements/orchestration.py`:

For `create_generation()` (has `user` param):
```python
from apps.subscriptions.services import SubscriptionService

# At start of create_generation(), after input validation:
if not SubscriptionService.check_storage(user):
    raise ValueError('Хранилище заполнено. Перейдите на другой тариф для увеличения.')
```

For `create_upload()` (no `user` param — derive from project):
```python
# At start of create_upload():
from apps.subscriptions.services import SubscriptionService
if not SubscriptionService.check_storage(project.user):
    raise ValueError('Хранилище заполнено. Перейдите на другой тариф для увеличения.')
```

For presign actions in `scenes/views.py:210` and `projects/views.py:112`:
```python
# Add at start of presign action:
from apps.subscriptions.services import SubscriptionService
if not SubscriptionService.check_storage(request.user):
    return Response({'detail': 'Хранилище заполнено. Перейдите на другой тариф.'}, status=403)
```

- [ ] **Step 5: Commit**

```bash
git add backend/apps/projects/views.py backend/apps/scenes/views.py backend/apps/sharing/views.py backend/apps/elements/orchestration.py
git commit -m "feat(subscriptions): wire up backend enforcement for limits and features"
```

---

## Task 7: Update UserSerializer + remove UserQuota

**Files:**
- Modify: `backend/apps/users/serializers.py:61-106`
- Modify: `backend/apps/users/models.py:59-108` — Remove UserQuota
- Modify: `backend/apps/users/admin.py:117-123` — Remove UserQuotaAdmin
- Modify: `backend/apps/cabinet/services.py:316,344`
- Create: `backend/apps/users/migrations/XXXX_remove_userquota.py`

- [ ] **Step 1: Rewrite get_quota() in UserSerializer**

In `backend/apps/users/serializers.py`, rewrite `get_quota()` to use SubscriptionService:

```python
from apps.subscriptions.services import SubscriptionService
from apps.subscriptions.serializers import SubscriptionSerializer

class UserSerializer(serializers.ModelSerializer):
    quota = serializers.SerializerMethodField()
    subscription = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'is_email_verified', 'quota', 'subscription', 'created_at', 'updated_at']

    def get_quota(self, obj):
        return SubscriptionService.get_limits(obj)

    def get_subscription(self, obj):
        try:
            sub = obj.subscription
            return SubscriptionSerializer(sub).data
        except Exception:
            return None
```

- [ ] **Step 2: Update cabinet services**

In `backend/apps/cabinet/services.py`, replace `quota.storage_limit_bytes` references:

```python
# Replace lines ~316, ~344:
from apps.subscriptions.services import SubscriptionService

plan = SubscriptionService.get_active_plan(user)
storage_limit = plan.storage_limit_bytes or (1024 ** 4)  # fallback 1TB for unlimited
```

- [ ] **Step 3: Remove UserQuota model**

In `backend/apps/users/models.py`:
- Delete `UserQuota` class (lines 59-102)
- Update signal to not create UserQuota (keep Subscription creation from Task 4)

In `backend/apps/users/admin.py`:
- Delete `UserQuotaAdmin` class (lines 117-123)

- [ ] **Step 4: Add select_related to MeView**

In `backend/apps/users/views.py`, update MeView to optimize queries:

```python
def get_object(self):
    return User.objects.select_related(
        'subscription', 'subscription__plan'
    ).prefetch_related(
        'subscription__plan__features'
    ).get(pk=self.request.user.pk)
```

- [ ] **Step 5: Create migration to drop table**

```bash
docker compose exec backend python manage.py makemigrations users
docker compose exec backend python manage.py migrate
```

- [ ] **Step 6: Verify API still returns quota**

```bash
curl -s http://localhost:8000/api/auth/me/ -H "Authorization: Bearer <token>" | python -m json.tool
```

Verify `quota` field has same structure as before + new `subscription` field.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/users/ backend/apps/cabinet/services.py
git commit -m "refactor: replace UserQuota with Plan-based quota, add subscription to user API"
```

---

## Task 8: Django Admin — Plan, Feature, Subscription

**Files:**
- Create: `backend/apps/subscriptions/admin.py`
- Create: `backend/apps/subscriptions/admin_forms.py`
- Create: `backend/templates/admin/subscriptions/plan/change_form.html`
- Create: `backend/static/admin/subscriptions/subscriptions_admin.css`

- [ ] **Step 1: Write admin.py**

Full admin with fieldsets, display methods, color-coded statuses, quick actions, help texts, inline previews. Match AIModel admin quality:

Key features:
- **PlanAdmin**: list_display with all fields, colored badges for is_default/is_recommended, list_editable for display_order, 4 fieldsets with help text, checkbox features widget
- **FeatureAdmin**: readonly code (after creation), preview of how modal looks, inline hint text
- **SubscriptionAdmin**: color-coded status badges, user email/username search, quick actions (assign plan 30 days, extend 30 days, reset to free), list_filter by plan and status

- [ ] **Step 2: Write admin CSS**

Create `backend/static/admin/subscriptions/subscriptions_admin.css` — consistent with `backend/static/admin/ai_providers/aimodel_workflow.css` design system.

- [ ] **Step 3: Write custom change_form template for Plan**

`backend/templates/admin/subscriptions/plan/change_form.html` — extends admin change_form, adds summary panel showing how many users are on this plan, visual preview of limits.

- [ ] **Step 4: Test admin in browser**

Navigate to Django Admin → Подписки и тарифы. Verify:
- Plans list shows all 5 plans with correct data
- Plan edit form has 4 fieldsets
- Features show with preview
- Subscriptions show users with status badges
- Quick actions work

- [ ] **Step 5: Commit**

```bash
git add backend/apps/subscriptions/admin.py backend/apps/subscriptions/admin_forms.py backend/templates/admin/subscriptions/ backend/static/admin/subscriptions/
git commit -m "feat(subscriptions): add premium Django admin with custom templates and quick actions"
```

---

## Task 9: Frontend — subscription store, types, API

**Files:**
- Create: `frontend/lib/api/subscriptions.ts`
- Create: `frontend/lib/store/subscription.ts`
- Modify: `frontend/lib/types/index.ts:3-9`
- Modify: `frontend/lib/store/auth.ts`

- [ ] **Step 1: Update types**

In `frontend/lib/types/index.ts`, add Subscription type and update User:

```typescript
export interface User {
  id: number;
  username: string;
  email: string;
  is_email_verified?: boolean;
  quota?: UserQuota;
  subscription?: UserSubscription;
}

export interface UserSubscription {
  plan_code: string;
  plan_name: string;
  status: 'active' | 'trial' | 'expired' | 'cancelled';
  expires_at: string | null;
  features: string[];
  is_trial: boolean;
  trial_days_left: number | null;
}

export interface FeatureGateInfo {
  code: string;
  title: string;
  description: string;
  icon: string;
  min_plan_name: string;
  min_plan_price: number;
}

export interface PlanInfo {
  code: string;
  name: string;
  price: number;
  credits_per_month: number;
  max_projects: number;
  storage_limit_gb: number;
  features: { code: string; title: string }[];
  is_recommended: boolean;
}
```

- [ ] **Step 2: Write API client**

```typescript
// frontend/lib/api/subscriptions.ts
import { apiClient } from './client';
import type { FeatureGateInfo, PlanInfo } from '../types';

export const subscriptionsApi = {
  getPlans: () => apiClient.get<PlanInfo[]>('/api/subscriptions/plans/'),
  getFeatureGate: (code: string) => apiClient.get<FeatureGateInfo>(`/api/subscriptions/feature-gate/${code}/`),
};
```

- [ ] **Step 3: Write subscription store**

```typescript
// frontend/lib/store/subscription.ts
import { create } from 'zustand';
import type { UserSubscription } from '../types';

interface SubscriptionState {
  planCode: string;
  planName: string;
  status: string;
  features: string[];
  isTrial: boolean;
  trialDaysLeft: number | null;

  setFromUser: (sub: UserSubscription | undefined) => void;
  hasFeature: (code: string) => boolean;
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  planCode: 'free',
  planName: 'Старт',
  status: 'active',
  features: [],
  isTrial: false,
  trialDaysLeft: null,

  setFromUser: (sub) => {
    if (!sub) return;
    set({
      planCode: sub.plan_code,
      planName: sub.plan_name,
      status: sub.status,
      features: sub.features,
      isTrial: sub.is_trial,
      trialDaysLeft: sub.trial_days_left,
    });
  },

  hasFeature: (code) => get().features.includes(code),
}));
```

- [ ] **Step 4: Sync subscription on auth**

In `frontend/lib/store/auth.ts`, after `setUser()` is called, also call `useSubscriptionStore.getState().setFromUser(user.subscription)`.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/types/index.ts frontend/lib/api/subscriptions.ts frontend/lib/store/subscription.ts frontend/lib/store/auth.ts
git commit -m "feat(frontend): add subscription store, types, and API client"
```

---

## Task 10: Frontend — UpgradeModal, FeatureGate, ProBadge components

**Files:**
- Create: `frontend/components/subscription/UpgradeModal.tsx`
- Create: `frontend/components/subscription/FeatureGate.tsx`
- Create: `frontend/components/subscription/ProBadge.tsx`
- Create: `frontend/components/subscription/LimitBar.tsx`

- [ ] **Step 1: Write ProBadge**

Small gradient badge showing "PRO" or plan name. Used on locked buttons.

- [ ] **Step 2: Write LimitBar**

Purple-only progress bar. Props: `used`, `max`, `label`, `upgradeText`. Always purple — no red/orange.

- [ ] **Step 3: Write UpgradeModal**

Single modal component. Two modes:
- **Feature mode**: fetches FeatureGateInfo from API, shows icon + title + description + "Подключить {plan} — {price}₽/мес" + "Сравнить тарифы →"
- **Limit mode**: shows limit info + LimitBar + upgrade button

Uses shadcn `Dialog` component. Positive tone. "Сравнить тарифы" links to `/pricing`.

- [ ] **Step 4: Write FeatureGate wrapper**

```tsx
// Wraps any element. If feature is locked, shows muted + ProBadge, click opens UpgradeModal.
<FeatureGate feature="sharing">
  <Button>Поделиться</Button>
</FeatureGate>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/components/subscription/
git commit -m "feat(frontend): add UpgradeModal, FeatureGate, ProBadge, LimitBar components"
```

---

## Task 11: Frontend — wire up gating in existing UI

**Files:**
- Modify: `frontend/components/layout/Navbar.tsx:172-200`
- Modify: sharing button (wherever "Поделиться" button lives)
- Modify: project creation button
- Create: `frontend/components/subscription/TrialBanner.tsx`

- [ ] **Step 1: Fix Navbar storage bar — purple only**

Replace the red/orange/green conditional (lines 184-189) with always-purple:

```tsx
className="h-full rounded-full transition-all bg-primary"
```

- [ ] **Step 2: Add TrialBanner to Navbar**

Accent text in header: "Пробный период: N дней" — purple, next to avatar. Shows when `isTrial` and `trialDaysLeft <= 2`, or when trial just expired (one-time banner).

- [ ] **Step 3: Wrap sharing button with FeatureGate**

Find the "Поделиться" button and wrap with `<FeatureGate feature="sharing">`.

- [ ] **Step 4: Add project creation limit check**

On the projects page, check `useSubscriptionStore` before showing "Создать проект". If at limit, show LimitBar + muted button.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/
git commit -m "feat(frontend): wire up feature gating in Navbar, sharing, project creation"
```

---

## Task 12: Pricing page stub

**Files:**
- Create: `frontend/app/(workspace)/pricing/page.tsx`

- [ ] **Step 1: Write pricing stub page**

Fetches plans from `GET /api/subscriptions/plans/`. Renders simple table matching the tariff grid. Current plan highlighted. "Для подключения напишите нам" text at bottom. Will be replaced by designer later.

- [ ] **Step 2: Commit**

```bash
git add frontend/app/
git commit -m "feat(frontend): add pricing page stub"
```

---

## Task 13: End-to-end verification

- [ ] **Step 1: Test trial flow**

Register new user → verify Subscription created with status=trial → verify 50 bonus credits → verify all features accessible → wait/manually expire → verify features locked.

- [ ] **Step 2: Test admin flow**

Open Django Admin → assign user a plan → verify features unlock → verify limits change.

- [ ] **Step 3: Test frontend gating**

Login as free user → verify PRO badges on sharing → click → verify UpgradeModal → verify "Сравнить тарифы" links to /pricing.

- [ ] **Step 4: Test limits**

Create project up to limit → verify progress bar → verify create button locked → assign higher plan → verify unlocked.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(subscriptions): complete subscription & feature gating system"
```
