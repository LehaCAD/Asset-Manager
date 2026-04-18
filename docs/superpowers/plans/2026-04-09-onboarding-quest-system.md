# Onboarding Quest System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an onboarding system that guides new users from registration to first generation via a welcome modal, progress ring in navbar, checklist popover with credit rewards, and enhanced empty states — all admin-editable.

**Architecture:** New isolated Django app `apps/onboarding/` with 3 models (OnboardingTask, UserTaskCompletion, UserOnboardingState). Backend signals trigger task completions, CreditsService pays rewards. Frontend: Zustand store + 5 components integrated into existing navbar and empty states. All text/icons/rewards editable from Django admin with live preview.

**Tech Stack:** Django 5, DRF, Channels (WebSocket), Celery | Next.js 14, React 19, Zustand 5, Tailwind 4, shadcn/ui, lucide-react

**Spec:** `docs/superpowers/specs/2026-04-09-onboarding-quest-system-design.md`

---

## File Structure

### Backend — new app `backend/apps/onboarding/`

| File | Responsibility |
|------|---------------|
| `apps.py` | AppConfig with `ready()` that imports signals |
| `models.py` | OnboardingTask, UserTaskCompletion, UserOnboardingState |
| `services.py` | OnboardingService — try_complete(), backfill_for_user() |
| `serializers.py` | OnboardingTaskSerializer, OnboardingStateSerializer |
| `views.py` | OnboardingViewSet (list, welcome-seen, complete) |
| `urls.py` | URL routing under `/api/onboarding/` |
| `signals.py` | Receivers for Project/Scene/Element/SharedLink post_save |
| `admin.py` | OnboardingTaskAdmin with custom template |
| `admin_forms.py` | OnboardingTaskAdminForm |
| `migrations/0001_initial.py` | Create tables |
| `migrations/0002_seed_onboarding_tasks.py` | Seed 8 initial tasks |
| `tests/test_models.py` | Model unit tests |
| `tests/test_services.py` | Service tests (try_complete, backfill, atomicity) |
| `tests/test_views.py` | API endpoint tests |
| `tests/test_signals.py` | Signal integration tests |

### Backend — modifications to existing files

| File | Change |
|------|--------|
| `backend/config/urls.py` | Add `path('api/onboarding/', include('apps.onboarding.urls'))` |
| `backend/apps/credits/models.py` | Add `REASON_ONBOARDING_TASK = 'onboarding_task'` |
| `backend/apps/notifications/consumers.py` | Add `onboarding_task_completed` handler |
| `backend/config/settings.py` | Add `'apps.onboarding'` to `INSTALLED_APPS` |

### Backend — admin templates & static

| File | Responsibility |
|------|---------------|
| `backend/templates/admin/onboarding/onboardingtask/change_form.html` | Custom admin form with icon picker + preview |
| `backend/static/admin/onboarding/task_preview.js` | Live preview JS |
| `backend/static/admin/onboarding/icon_picker.js` | Lucide icon picker widget |
| `backend/static/admin/onboarding/onboarding_admin.css` | Admin styles |

### Frontend — new files

| File | Responsibility |
|------|---------------|
| `frontend/lib/api/onboarding.ts` | API client |
| `frontend/lib/store/onboarding.ts` | Zustand store |
| `frontend/components/onboarding/icon-map.ts` | Lucide icon name → component mapping |
| `frontend/components/onboarding/WelcomeModal.tsx` | First-login welcome modal |
| `frontend/components/onboarding/OnboardingProgress.tsx` | Navbar progress ring |
| `frontend/components/onboarding/OnboardingPopover.tsx` | Checklist popover |
| `frontend/components/onboarding/OnboardingTaskRow.tsx` | Single task row in popover |
| `frontend/components/onboarding/OnboardingEmptyState.tsx` | Enhanced empty state with reward |
| `frontend/components/onboarding/OnboardingBootstrap.tsx` | Client wrapper for layout (fetch + WelcomeModal) |

### Frontend — modifications

| File | Change |
|------|--------|
| `frontend/lib/types/index.ts` | Add onboarding types + WS event type |
| `frontend/components/layout/Navbar.tsx` | Add `<OnboardingProgress />` between balance and notifications |
| `frontend/app/(workspace)/layout.tsx` | Add `<WelcomeModal />` + call `fetchOnboarding()` |
| `frontend/components/project/ProjectGrid.tsx` | Use `OnboardingEmptyState` when task incomplete |
| `frontend/components/scene/ScenarioTableClient.tsx` | Use `OnboardingEmptyState` when task incomplete |
| `frontend/components/element/EmptyState.tsx` | Add onboarding block above upload zone |

---

## Task 1: Backend models + migration

**Files:**
- Create: `backend/apps/onboarding/__init__.py`
- Create: `backend/apps/onboarding/apps.py`
- Create: `backend/apps/onboarding/models.py`
- Create: `backend/apps/onboarding/tests/__init__.py`
- Create: `backend/apps/onboarding/tests/test_models.py`
- Modify: `backend/config/settings.py` — add to INSTALLED_APPS
- Modify: `backend/apps/credits/models.py` — add REASON constant

- [ ] **Step 1: Create app skeleton**

Create `backend/apps/onboarding/__init__.py` (empty), `apps.py`:

```python
from django.apps import AppConfig

class OnboardingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.onboarding'
    verbose_name = 'Онбординг и задания'

    def ready(self):
        import apps.onboarding.signals  # noqa: F401
```

- [ ] **Step 2: Write models**

Create `backend/apps/onboarding/models.py` with three models:

```python
from django.conf import settings
from django.db import models


class OnboardingTask(models.Model):
    CATEGORY_CHOICES = [
        ('onboarding', 'Первые шаги'),
        ('feature', 'Возможности'),
        ('milestone', 'Достижения'),
    ]
    TRIGGER_TYPE_CHOICES = [
        ('backend_signal', 'Авто (бэкенд)'),
        ('frontend_action', 'По действию (фронт)'),
    ]

    code = models.CharField(max_length=60, unique=True)
    title = models.CharField('Название', max_length=120)
    description = models.CharField('Описание', max_length=200)
    icon = models.CharField('Иконка (Lucide)', max_length=50, default='circle-dot')
    reward = models.DecimalField('Награда (кадров)', max_digits=10, decimal_places=2, default=0)
    order = models.PositiveIntegerField('Порядок', default=0)
    is_active = models.BooleanField('Активно', default=True)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='onboarding')
    trigger_type = models.CharField(max_length=20, choices=TRIGGER_TYPE_CHOICES, default='backend_signal')
    trigger_event = models.CharField(max_length=100, blank=True, default='')

    empty_state_title = models.CharField('Заголовок пустого экрана', max_length=120, blank=True, default='')
    empty_state_desc = models.CharField('Описание пустого экрана', max_length=200, blank=True, default='')
    empty_state_cta = models.CharField('Кнопка пустого экрана', max_length=60, blank=True, default='')
    empty_state_page = models.CharField('Страница', max_length=20, blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order']
        verbose_name = 'Задание'
        verbose_name_plural = 'Задания'

    def __str__(self):
        return f'{self.order}. {self.title}'


class UserOnboardingState(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='onboarding_state',
    )
    welcome_seen = models.BooleanField(default=False)
    backfill_done = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Состояние онбординга'
        verbose_name_plural = 'Состояния онбординга'


class UserTaskCompletion(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='task_completions',
    )
    task = models.ForeignKey(
        OnboardingTask,
        on_delete=models.CASCADE,
        related_name='completions',
    )
    completed_at = models.DateTimeField(auto_now_add=True)
    reward_paid = models.BooleanField(default=False)

    class Meta:
        unique_together = ('user', 'task')
        verbose_name = 'Выполнение задания'
        verbose_name_plural = 'Выполнения заданий'
```

- [ ] **Step 3: Add to INSTALLED_APPS and add credit reason**

In `backend/config/settings.py`, add `'apps.onboarding'` to `INSTALLED_APPS`.

In `backend/apps/credits/models.py`, add after existing REASON constants:

```python
REASON_ONBOARDING_TASK = "onboarding_task"
```

**Also add to `REASON_CHOICES` list** (around line 19-28):

```python
(REASON_ONBOARDING_TASK, "Бонус за онбординг-задание"),
```

This ensures Django admin and serializers recognize the new reason.

- [ ] **Step 4: Create empty signals.py** (required by apps.py ready())

Create `backend/apps/onboarding/signals.py`:

```python
# Signals will be added in Task 4
```

- [ ] **Step 5: Run makemigrations and migrate**

Run: `docker compose exec backend python manage.py makemigrations onboarding`
Run: `docker compose exec backend python manage.py migrate`

- [ ] **Step 6: Write model tests**

Create `backend/apps/onboarding/tests/__init__.py` (empty) and `test_models.py`:

```python
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
```

- [ ] **Step 7: Run tests**

Run: `docker compose exec backend python manage.py test apps.onboarding.tests.test_models -v2`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/onboarding/ backend/config/settings.py backend/apps/credits/models.py
git commit -m "feat(onboarding): add models — OnboardingTask, UserTaskCompletion, UserOnboardingState"
```

---

## Task 2: Seed data migration

**Files:**
- Create: `backend/apps/onboarding/migrations/0002_seed_onboarding_tasks.py`

- [ ] **Step 1: Write seed migration**

Create data migration with all 8 initial tasks from the spec (section 6). Use `RunPython` with `code`, `title`, `description`, `icon`, `reward`, `order`, `category`, `trigger_type`, `trigger_event`, `empty_state_title`, `empty_state_desc`, `empty_state_cta`, `empty_state_page`. Include reverse function that deletes seeded tasks.

- [ ] **Step 2: Run migration**

Run: `docker compose exec backend python manage.py migrate onboarding`

- [ ] **Step 3: Verify in shell**

Run: `docker compose exec backend python manage.py shell -c "from apps.onboarding.models import OnboardingTask; print(OnboardingTask.objects.count())"` 
Expected: `8`

- [ ] **Step 4: Commit**

```bash
git add backend/apps/onboarding/migrations/
git commit -m "feat(onboarding): seed 8 initial onboarding tasks"
```

---

## Task 3: Backend services

**Files:**
- Create: `backend/apps/onboarding/services.py`
- Create: `backend/apps/onboarding/tests/test_services.py`

- [ ] **Step 1: Write service tests**

Test `OnboardingService.try_complete()`:
- completes a task and pays reward
- idempotent — second call returns without double-paying
- skips inactive tasks
- skips tasks with wrong trigger_event

Test `OnboardingService.backfill_for_user()`:
- marks existing projects/scenes/generations as completed without reward
- sets `backfill_done=True`
- second call is no-op

Test `OnboardingService.get_state()`:
- returns tasks, completions, totals
- creates `UserOnboardingState` on first call
- triggers backfill on first call

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec backend python manage.py test apps.onboarding.tests.test_services -v2`
Expected: ImportError (services.py doesn't exist yet)

- [ ] **Step 3: Implement OnboardingService**

Create `backend/apps/onboarding/services.py`:

```python
from decimal import Decimal
from django.db import transaction
from apps.credits.services import CreditsService
from .models import OnboardingTask, UserTaskCompletion, UserOnboardingState


class OnboardingService:
    def try_complete(self, user, event_name: str, *, pay_reward: bool = True):
        """Attempt to complete a task triggered by event_name. Idempotent."""
        task = OnboardingTask.objects.filter(
            trigger_event=event_name, is_active=True,
        ).first()
        if not task:
            return None

        with transaction.atomic():
            completion, created = UserTaskCompletion.objects.get_or_create(
                user=user, task=task,
            )
            if created and pay_reward and task.reward > 0:
                result = CreditsService().topup(
                    user, task.reward,
                    reason='onboarding_task',
                    metadata={'task_code': task.code},
                )
                completion.reward_paid = True
                completion.save(update_fields=['reward_paid'])
                new_balance = result.balance_after
                # Defer WS notification until after transaction commits
                transaction.on_commit(
                    lambda: self._notify_task_completed(user, task, new_balance)
                )
        return completion

    def complete_by_code(self, user, task_code: str):
        """Complete a frontend_action task by code. Idempotent."""
        task = OnboardingTask.objects.filter(
            code=task_code, trigger_type='frontend_action', is_active=True,
        ).first()
        if not task:
            return None

        with transaction.atomic():
            completion, created = UserTaskCompletion.objects.get_or_create(
                user=user, task=task,
            )
            if created and task.reward > 0:
                result = CreditsService().topup(
                    user, task.reward,
                    reason='onboarding_task',
                    metadata={'task_code': task.code},
                )
                completion.reward_paid = True
                completion.save(update_fields=['reward_paid'])
                new_balance = result.balance_after
                transaction.on_commit(
                    lambda: self._notify_task_completed(user, task, new_balance)
                )
        return completion

    def get_state(self, user):
        """Get full onboarding state. Creates UserOnboardingState if missing. Runs backfill once."""
        state, _ = UserOnboardingState.objects.get_or_create(user=user)
        if not state.backfill_done:
            self.backfill_for_user(user, state)
        return state

    def backfill_for_user(self, user, state=None):
        """For users who registered before onboarding. Mark existing actions as completed (no reward)."""
        if state is None:
            state, _ = UserOnboardingState.objects.get_or_create(user=user)

        backfill_checks = {
            'create_project': user.projects.exists(),
            'create_scene': self._user_has_scenes(user),
            'first_generation': self._user_has_generation(user),
            'first_upload': self._user_has_upload(user),
            'share_project': self._user_has_shared_link(user),
        }

        for code, exists in backfill_checks.items():
            if exists:
                task = OnboardingTask.objects.filter(code=code, is_active=True).first()
                if task:
                    UserTaskCompletion.objects.get_or_create(
                        user=user, task=task,
                        defaults={'reward_paid': False},
                    )

        state.backfill_done = True
        state.save(update_fields=['backfill_done'])

    def _user_has_scenes(self, user):
        from apps.scenes.models import Scene
        return Scene.objects.filter(project__user=user).exists()

    def _user_has_generation(self, user):
        from apps.elements.models import Element
        return Element.objects.filter(
            scene__project__user=user, source_type='GENERATED', status='COMPLETED',
        ).exists()

    def _user_has_upload(self, user):
        from apps.elements.models import Element
        return Element.objects.filter(
            scene__project__user=user, source_type='UPLOADED', status='COMPLETED',
        ).exists()

    def _user_has_shared_link(self, user):
        from apps.sharing.models import SharedLink
        return SharedLink.objects.filter(project__user=user).exists()

    def _notify_task_completed(self, user, task, new_balance):
        """Send WebSocket notification via user_{id} channel.
        Called via transaction.on_commit() — runs after DB commit."""
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync

            total = OnboardingTask.objects.filter(is_active=True).count()
            completed = UserTaskCompletion.objects.filter(
                user=user, task__is_active=True,
            ).count()

            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f'user_{user.id}',
                {
                    'type': 'onboarding_task_completed',
                    'task_code': task.code,
                    'task_title': task.title,
                    'reward': str(task.reward),
                    'new_balance': str(new_balance),
                    'completed_count': completed,
                    'total_count': total,
                },
            )
        except Exception:
            pass  # Non-critical — frontend will refresh on next poll
```

- [ ] **Step 4: Run tests**

Run: `docker compose exec backend python manage.py test apps.onboarding.tests.test_services -v2`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/onboarding/services.py backend/apps/onboarding/tests/test_services.py
git commit -m "feat(onboarding): add OnboardingService — try_complete, backfill, complete_by_code"
```

---

## Task 4: Backend signals

**Files:**
- Modify: `backend/apps/onboarding/signals.py`
- Modify: `backend/apps/elements/generation.py` — add onboarding call in finalize_success
- Modify: `backend/apps/elements/tasks.py` — add onboarding call in process_upload
- Create: `backend/apps/onboarding/tests/test_signals.py`

- [ ] **Step 1: Write signal tests**

Test that creating a Project triggers `project.created` → `create_project` task completes.
Test that creating a Scene triggers `scene.created` → `create_scene` task completes.
Test that creating a SharedLink triggers `sharing.link_created` → `share_project` task completes.

- [ ] **Step 2: Implement signals.py**

```python
from django.db.models.signals import post_save
from django.dispatch import receiver
from .services import OnboardingService


@receiver(post_save, sender='projects.Project')
def on_project_created(sender, instance, created, **kwargs):
    if created:
        OnboardingService().try_complete(instance.user, 'project.created')


@receiver(post_save, sender='scenes.Scene')
def on_scene_created(sender, instance, created, **kwargs):
    if created:
        OnboardingService().try_complete(instance.project.user, 'scene.created')


@receiver(post_save, sender='sharing.SharedLink')
def on_shared_link_created(sender, instance, created, **kwargs):
    if created:
        OnboardingService().try_complete(instance.project.user, 'sharing.link_created')
```

- [ ] **Step 3: Add onboarding calls in generation and upload**

In `backend/apps/elements/generation.py`, inside `finalize_success()` after status update:

```python
# Onboarding: mark first generation
try:
    from apps.onboarding.services import OnboardingService
    OnboardingService().try_complete(element.scene.project.user, 'element.generation_success')
except Exception:
    pass
```

In `backend/apps/elements/tasks.py`, inside `process_uploaded_file()` after successful upload:

```python
# Onboarding: mark first upload
try:
    from apps.onboarding.services import OnboardingService
    OnboardingService().try_complete(element.scene.project.user, 'element.upload_success')
except Exception:
    pass
```

- [ ] **Step 4: Run tests**

Run: `docker compose exec backend python manage.py test apps.onboarding.tests.test_signals -v2`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/onboarding/signals.py backend/apps/elements/generation.py backend/apps/elements/tasks.py backend/apps/onboarding/tests/test_signals.py
git commit -m "feat(onboarding): add signals — project, scene, generation, upload, sharing"
```

---

## Task 5: Backend API (serializers + views + urls)

**Files:**
- Create: `backend/apps/onboarding/serializers.py`
- Create: `backend/apps/onboarding/views.py`
- Create: `backend/apps/onboarding/urls.py`
- Modify: `backend/config/urls.py`
- Create: `backend/apps/onboarding/tests/test_views.py`

- [ ] **Step 1: Write view tests**

Test GET `/api/onboarding/` — returns tasks with completion state, totals.
Test POST `/api/onboarding/welcome-seen/` — sets welcome_seen.
Test POST `/api/onboarding/complete/` — completes frontend_action task, returns reward.
Test POST `/api/onboarding/complete/` — already completed returns ok + already_completed.
Test POST `/api/onboarding/complete/` — backend_signal task returns 400.

- [ ] **Step 2: Implement serializers**

```python
from rest_framework import serializers
from .models import OnboardingTask, UserTaskCompletion


class OnboardingTaskSerializer(serializers.ModelSerializer):
    completed = serializers.BooleanField(read_only=True, default=False)
    completed_at = serializers.DateTimeField(read_only=True, default=None)
    empty_state = serializers.SerializerMethodField()

    class Meta:
        model = OnboardingTask
        fields = [
            'code', 'title', 'description', 'icon', 'reward',
            'order', 'completed', 'completed_at', 'empty_state',
        ]

    def get_empty_state(self, obj):
        if not obj.empty_state_page:
            return None
        return {
            'title': obj.empty_state_title,
            'description': obj.empty_state_desc,
            'cta': obj.empty_state_cta,
            'page': obj.empty_state_page,
        }
```

- [ ] **Step 3: Implement views**

Three endpoints as APIViews: `OnboardingListView` (GET), `WelcomeSeenView` (POST), `CompleteTaskView` (POST). Use `OnboardingService` for business logic. See spec section 4 for response shapes.

- [ ] **Step 4: Implement urls.py and register in config/urls.py**

```python
from django.urls import path
from . import views

urlpatterns = [
    path('', views.OnboardingListView.as_view()),
    path('welcome-seen/', views.WelcomeSeenView.as_view()),
    path('complete/', views.CompleteTaskView.as_view()),
]
```

Add to `config/urls.py`: `path('api/onboarding/', include('apps.onboarding.urls')),`

- [ ] **Step 5: Run tests**

Run: `docker compose exec backend python manage.py test apps.onboarding.tests.test_views -v2`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/onboarding/serializers.py backend/apps/onboarding/views.py backend/apps/onboarding/urls.py backend/config/urls.py backend/apps/onboarding/tests/test_views.py
git commit -m "feat(onboarding): add API — list, welcome-seen, complete endpoints"
```

---

## Task 6: WebSocket integration

**Files:**
- Modify: `backend/apps/notifications/consumers.py`

- [ ] **Step 1: Add handler to NotificationConsumer**

Add method to `NotificationConsumer`:

```python
async def onboarding_task_completed(self, event):
    await self.send_json(event)
```

- [ ] **Step 2: Verify manually** (optional)

The WebSocket event is already sent by `OnboardingService._notify_task_completed()` from Task 3.

- [ ] **Step 3: Commit**

```bash
git add backend/apps/notifications/consumers.py
git commit -m "feat(onboarding): add WebSocket handler for onboarding_task_completed"
```

---

## Task 7: Django Admin with icon picker + live preview

**Files:**
- Create: `backend/apps/onboarding/admin.py`
- Create: `backend/apps/onboarding/admin_forms.py`
- Create: `backend/templates/admin/onboarding/onboardingtask/change_form.html`
- Create: `backend/static/admin/onboarding/task_preview.js`
- Create: `backend/static/admin/onboarding/icon_picker.js`
- Create: `backend/static/admin/onboarding/onboarding_admin.css`

- [ ] **Step 1: Write admin.py**

Register `OnboardingTaskAdmin` with:
- `list_display`: order, title, icon, reward, category, is_active
- `list_editable`: order, is_active
- `readonly_fields`: code, category, trigger_type, trigger_event
- `fieldsets`: Основное (title, description, reward, order, is_active), Иконка (icon), Пустой экран (empty_state_*), Техническое (readonly, collapsed)
- Custom `change_form_template`
- Media: JS + CSS files

Also register `UserOnboardingState` (readonly, for debugging).

- [ ] **Step 2: Write admin_forms.py**

Custom form that adds `icon_picker_context` to the template context — list of 30 icon names with SVG paths for the visual picker.

- [ ] **Step 3: Write change_form.html**

Extends `admin/change_form.html`. Adds:
- Icon picker grid (30 icons, visual selection)
- Live preview panel: checklist row + empty state card
- Uses `{% block after_field_sets %}` for preview section

- [ ] **Step 4: Write task_preview.js**

Client-side JS that:
- Listens to input/change events on title, description, icon, reward, empty_state_* fields
- Updates preview DOM in real-time
- Mirrors the popover row style and empty state card style from the spec

- [ ] **Step 5: Write icon_picker.js**

Renders icon grid from static data, handles click → sets hidden input + visual highlight.

- [ ] **Step 6: Write CSS**

Styles for icon picker grid, preview panel, collapsed tech section.

- [ ] **Step 7: Verify in browser**

Open admin `/admin/onboarding/onboardingtask/` and verify:
- List view shows tasks
- Edit form shows icon picker
- Live preview updates on typing
- Readonly fields are not editable

- [ ] **Step 8: Commit**

```bash
git add backend/apps/onboarding/admin.py backend/apps/onboarding/admin_forms.py backend/templates/admin/onboarding/ backend/static/admin/onboarding/
git commit -m "feat(onboarding): Django admin with icon picker and live preview"
```

---

## Task 8: Frontend types + API + store

**Files:**
- Modify: `frontend/lib/types/index.ts`
- Create: `frontend/lib/api/onboarding.ts`
- Create: `frontend/lib/store/onboarding.ts`
- Create: `frontend/components/onboarding/icon-map.ts`

- [ ] **Step 1: Add types**

Add to `frontend/lib/types/index.ts`:

```typescript
// Onboarding
export interface OnboardingTaskEmptyState {
  title: string;
  description: string;
  cta: string;
  page: string;
}

export interface OnboardingTaskDTO {
  code: string;
  title: string;
  description: string;
  icon: string;
  reward: number;
  order: number;
  completed: boolean;
  completed_at: string | null;
  empty_state: OnboardingTaskEmptyState | null;
}

export interface OnboardingStateResponse {
  welcome_seen: boolean;
  tasks: OnboardingTaskDTO[];
  total_earned: number;
  total_possible: number;
  completed_count: number;
  total_count: number;
}

// WebSocket event
export interface WSOnboardingTaskCompletedEvent {
  type: 'onboarding_task_completed';
  task_code: string;
  task_title: string;
  reward: string;
  new_balance: string;
  completed_count: number;
  total_count: number;
}
```

- [ ] **Step 2: Write API client**

Create `frontend/lib/api/onboarding.ts`:

```typescript
import { apiClient } from './client';
import type { OnboardingStateResponse } from '@/lib/types';

export const onboardingApi = {
  async getState(): Promise<OnboardingStateResponse> {
    const { data } = await apiClient.get('/api/onboarding/');
    return data;
  },
  async markWelcomeSeen(): Promise<void> {
    await apiClient.post('/api/onboarding/welcome-seen/');
  },
  async completeTask(taskCode: string): Promise<{ ok: boolean; reward?: string; new_balance?: string; already_completed?: boolean }> {
    const { data } = await apiClient.post('/api/onboarding/complete/', { task_code: taskCode });
    return data;
  },
};
```

- [ ] **Step 3: Write Zustand store**

Create `frontend/lib/store/onboarding.ts` following the pattern from `credits.ts`:
- State: tasks, welcomeSeen, totalEarned, totalPossible, completedCount, totalCount, isLoaded
- Actions: fetchOnboarding, markWelcomeSeen, completeTask (with local check before API), getTaskForPage, isAllCompleted, handleTaskCompleted (for WebSocket)

- [ ] **Step 4: Write icon map**

Create `frontend/components/onboarding/icon-map.ts`:

```typescript
import type { LucideIcon } from 'lucide-react';
import { FolderOpen, LayoutGrid, WandSparkles, Maximize, Download, Upload, RefreshCw, Share2, CircleDot, Trophy } from 'lucide-react';

const ONBOARDING_ICONS: Record<string, LucideIcon> = {
  'folder-open': FolderOpen,
  'layout-grid': LayoutGrid,
  'wand-sparkles': WandSparkles,
  'maximize': Maximize,
  'download': Download,
  'upload': Upload,
  'refresh-cw': RefreshCw,
  'share-2': Share2,
  'trophy': Trophy,
};

export function getOnboardingIcon(name: string): LucideIcon {
  return ONBOARDING_ICONS[name] ?? CircleDot;
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/types/index.ts frontend/lib/api/onboarding.ts frontend/lib/store/onboarding.ts frontend/components/onboarding/icon-map.ts
git commit -m "feat(onboarding): frontend types, API client, Zustand store, icon map"
```

---

## Task 9: WelcomeModal component

**Files:**
- Create: `frontend/components/onboarding/WelcomeModal.tsx`
- Modify: `frontend/app/(workspace)/layout.tsx`

- [ ] **Step 1: Build WelcomeModal**

Modal with:
- Accent gradient bar at top (4px)
- Clapperboard icon (Lucide `clapperboard`, color `#8B7CF7`)
- Heading, description, bonus card (dynamic balance from creditsStore)
- Three step cards with Lucide icons (FolderPlus, WandSparkles, Image)
- Gradient "Начать" button
- Popup styles from branding: bg `#1C1C1E`, shadow, glow, radius 16px
- Uses shadcn `Dialog` component

- [ ] **Step 2: Create OnboardingBootstrap client wrapper**

`frontend/app/(workspace)/layout.tsx` is a server component — cannot use hooks directly. Create `frontend/components/onboarding/OnboardingBootstrap.tsx` ("use client"):

```typescript
"use client";
import { useEffect } from "react";
import { useOnboardingStore } from "@/lib/store/onboarding";
import { WelcomeModal } from "./WelcomeModal";

export function OnboardingBootstrap() {
  const fetchOnboarding = useOnboardingStore((s) => s.fetchOnboarding);
  useEffect(() => { fetchOnboarding(); }, [fetchOnboarding]);
  return <WelcomeModal />;
}
```

Then in `layout.tsx`, import and render `<OnboardingBootstrap />` inside the layout (no hooks needed in the server component).

- [ ] **Step 3: Test manually in browser**

Register a new user → should see welcome modal. Click "Начать" → modal closes, never shows again.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/onboarding/WelcomeModal.tsx frontend/app/\\(workspace\\)/layout.tsx
git commit -m "feat(onboarding): WelcomeModal component + workspace layout integration"
```

---

## Task 10: OnboardingProgress + OnboardingPopover

**Files:**
- Create: `frontend/components/onboarding/OnboardingProgress.tsx`
- Create: `frontend/components/onboarding/OnboardingPopover.tsx`
- Create: `frontend/components/onboarding/OnboardingTaskRow.tsx`
- Modify: `frontend/components/layout/Navbar.tsx`

- [ ] **Step 1: Build OnboardingTaskRow**

Single task row with three states: completed (green check, line-through, opacity 0.45), active (purple highlight, border-left), pending (muted). Shows icon via icon-map, title, description, reward with ChargeIcon.

- [ ] **Step 2: Build OnboardingPopover**

Popover content:
- Header: "Первые шаги" + ChargeIcon + earned/total + progress bar (gradient)
- Scrollable task list using OnboardingTaskRow
- Footer: "Все достижения →" link to `/cabinet/achievements`
- Popup style from branding

- [ ] **Step 3: Build OnboardingProgress**

SVG progress ring (32×32). Three states:
1. In progress: purple ring fill proportional to completion, counter inside
2. All done: green ring + check icon
3. Permanent: trophy icon (after all completed, use Trophy from lucide)

Wraps OnboardingPopover in shadcn `Popover`.

- [ ] **Step 4: Add to Navbar**

In `frontend/components/layout/Navbar.tsx`, add `<OnboardingProgress />` between the balance display and NotificationDropdown.

- [ ] **Step 5: Test in browser**

Verify ring shows in navbar, click opens popover with task list, states render correctly.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/onboarding/OnboardingTaskRow.tsx frontend/components/onboarding/OnboardingPopover.tsx frontend/components/onboarding/OnboardingProgress.tsx frontend/components/layout/Navbar.tsx
git commit -m "feat(onboarding): progress ring + checklist popover in navbar"
```

---

## Task 11: OnboardingEmptyState + integrations

**Files:**
- Create: `frontend/components/onboarding/OnboardingEmptyState.tsx`
- Modify: `frontend/components/project/ProjectGrid.tsx`
- Modify: `frontend/components/scene/ScenarioTableClient.tsx`
- Modify: `frontend/components/element/EmptyState.tsx`

- [ ] **Step 1: Build OnboardingEmptyState**

Reusable component that takes an `OnboardingTaskDTO` and an `onAction` callback:
- Icon from icon-map in accent color `#8B7CF7`
- Title, description from task's empty_state fields
- Reward badge with ChargeIcon
- Gradient CTA button

- [ ] **Step 2: Integrate in ProjectGrid**

In `ProjectGrid.tsx`, the existing `EmptyState` function:
- Import `useOnboardingStore`
- Check `getTaskForPage('projects')` — if task exists and not completed, render `<OnboardingEmptyState>`
- Otherwise render existing empty state

- [ ] **Step 3: Integrate in ScenarioTableClient**

Same pattern, `getTaskForPage('scenes')`.

- [ ] **Step 4: Integrate in element EmptyState**

In `EmptyState.tsx`, add an onboarding block **above** the existing upload dropzone. Check `getTaskForPage('elements')` — if task exists and not completed, show a hint: "Или сгенерируйте первое изображение — напишите промпт выше". Does NOT replace the upload area.

- [ ] **Step 5: Test in browser**

Create new user → empty projects page shows enhanced CTA with reward. Create project → empty scenes shows enhanced CTA. Enter scene → elements area shows generation hint above upload zone.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/onboarding/OnboardingEmptyState.tsx frontend/components/project/ProjectGrid.tsx frontend/components/scene/ScenarioTableClient.tsx frontend/components/element/EmptyState.tsx
git commit -m "feat(onboarding): enhanced empty states with onboarding task rewards"
```

---

## Task 12: Frontend trigger integrations + WebSocket

**Files:**
- Modify: `frontend/components/lightbox/LightboxModal.tsx` — trigger open_lightbox
- Modify: Download button component in DetailPanel — trigger download_original
- Modify: Retry button component — trigger retry_generation
- Modify: WebSocket handler for notification consumer

- [ ] **Step 1: Add frontend triggers**

In each component, after the existing action:
```typescript
useOnboardingStore.getState().completeTask('open_lightbox');
```

The store checks locally if already completed before calling API.

Places:
- `LightboxModal` on open → `completeTask('open_lightbox')`
- Download button onClick → `completeTask('download_original')`
- Retry/regenerate button onClick → `completeTask('retry_generation')`

- [ ] **Step 2: Add WebSocket handler**

Modify `frontend/lib/api/websocket.ts` (or `notification-ws.ts` — find the file that handles the notification WebSocket `onmessage`). The current handler only forwards `type === "new_notification"` events. Add a branch for `onboarding_task_completed`:

```typescript
// Inside onmessage handler, alongside existing "new_notification" check:
if (data.type === 'onboarding_task_completed') {
  useOnboardingStore.getState().handleTaskCompleted(data);
  useCreditsStore.getState().loadBalance();
  toast.success(`Задание выполнено: ${data.task_title} — +${data.reward} кадров`);
}
```

**Important:** The existing handler may filter events with `if (data.type === "new_notification")`. You need to add this new branch BEFORE or ALONGSIDE that filter, not inside it.

- [ ] **Step 3: Test end-to-end**

Full flow: Register → welcome modal → create project (toast: +5) → create group (toast: +5) → generate (toast: +10) → open lightbox → download → retry → share. Verify progress ring updates, toasts show, balance increases.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/lightbox/ frontend/components/ frontend/lib/
git commit -m "feat(onboarding): frontend triggers + WebSocket handler + toast notifications"
```

---

## Task 13: Final verification + cleanup

- [ ] **Step 1: Run all backend tests**

Run: `docker compose exec backend python manage.py test apps.onboarding -v2`
Expected: All pass.

- [ ] **Step 2: Run frontend build**

Run: `docker compose exec frontend npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Manual E2E test**

1. Register new user → welcome modal appears
2. Click "Начать" → redirects to projects, ring shows 0/8
3. Create project → toast "+5 кадров", ring 1/8
4. Create group → toast "+5", ring 2/8
5. Generate image → toast "+10", ring 3/8
6. Click image (lightbox) → ring 4/8
7. Download → ring 5/8
8. Upload image → ring 6/8
9. Retry generation → ring 7/8
10. Share project → ring 8/8, ring turns green ✓ then trophy
11. Open admin → edit task title → preview updates live

- [ ] **Step 4: Verify existing user backfill**

Login as existing user with projects → GET /api/onboarding/ should show some tasks pre-completed (without reward).

- [ ] **Step 5: Final commit**

Any remaining fixes.

```bash
git commit -m "feat(onboarding): final fixes and cleanup"
```
