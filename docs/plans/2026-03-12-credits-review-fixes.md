# Credits Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Убрать четыре найденные проблемы в credits-системе так, чтобы деньги жили в одном доменном контуре, estimate принимал реальные payload'ы, списание не терялось при сбое запуска генерации, а баланс на фронте не зависал после async refund.

**Architecture:** Все изменения баланса должны идти через `CreditsService` как через внутренний "банк". `SceneViewSet` должен быть только orchestration-слоем: запросить debit, создать `Element`, запустить задачу и гарантировать compensating refund на любом сбое после списания. Frontend не считает деньги сам, а только обновляет snapshot баланса в точках, где backend уже завершил debit/refund.

**Tech Stack:** Django 5, Django REST Framework, Celery, Next.js 16, React 19, Zustand, TypeScript.

---

## Environment Note

- In this Codex desktop Windows session, the `apply_patch` tool is failing with `Exit code: 1` even on trivial single-file updates.
- Reproduced on 2026-03-12 with both `Add File` and `Update File` patches.
- Until the host-side tool issue is fixed, use `functions.shell_command` for file edits in this plan.
- When writing files from PowerShell, always force UTF-8:

```powershell
$content = Get-Content -Raw -Encoding utf8 <path>
Set-Content -Encoding utf8 <path> $content
```
## Preconditions

- Рабочая директория backend: `C:\Users\ImpressivePC\Desktop\Asset Manager main\backend`
- Рабочая директория frontend: `C:\Users\ImpressivePC\Desktop\Asset Manager main\frontend`
- Перед backend-проверками убедиться, что `venv` действительно содержит зависимости из `backend/requirements.txt`.
- Если `manage.py` падает с `ModuleNotFoundError: celery`, сначала починить окружение:

```powershell
venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Task 1: Починить контракт estimate API

**Files:**
- Modify: `backend/apps/credits/serializers.py`
- Modify: `backend/apps/credits/views.py`
- Create: `backend/apps/credits/tests.py`

**Step 1: Write the failing serializer tests**

```python
from django.test import SimpleTestCase

from apps.credits.serializers import CreditsEstimateRequestSerializer


class CreditsEstimateRequestSerializerTests(SimpleTestCase):
    def test_accepts_numeric_generation_values(self):
        serializer = CreditsEstimateRequestSerializer(
            data={
                "ai_model_id": 1,
                "generation_config": {"width": 1024, "height": 1024},
            }
        )
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["generation_config"]["width"] == 1024

    def test_accepts_array_generation_values(self):
        serializer = CreditsEstimateRequestSerializer(
            data={
                "ai_model_id": 1,
                "generation_config": {"input_urls": ["https://x/1.png"]},
            }
        )
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["generation_config"]["input_urls"] == [
            "https://x/1.png"
        ]
```

**Step 2: Run test to verify it fails**

Run:

```powershell
venv\Scripts\python.exe manage.py test apps.credits.tests.CreditsEstimateRequestSerializerTests -v 2
```

Expected: FAIL, потому что текущий `DictField(child=CharField())` ломает массивы и приводит числа к строкам.

**Step 3: Write minimal implementation**

```python
from rest_framework import serializers


class CreditsEstimateRequestSerializer(serializers.Serializer):
    ai_model_id = serializers.IntegerField(min_value=1)
    generation_config = serializers.DictField(
        child=serializers.JSONField(),
        required=False,
        default=dict,
    )
```

Если DRF-версия ведет себя нестабильно с `child=JSONField()`, сделать кастомный field, который проверяет только то, что `generation_config` является `dict`, а значения оставляет как есть.

**Step 4: Keep error shape predictable**

- В `backend/apps/credits/views.py` оставить top-level ответ в текущем shape.
- Не добавлять frontend-специфичную валидацию в serializer.
- Все смысловые ошибки pricing по-прежнему должны приходить из `CreditsService`.

**Step 5: Run test to verify it passes**

Run:

```powershell
venv\Scripts\python.exe manage.py test apps.credits.tests.CreditsEstimateRequestSerializerTests -v 2
```

Expected: PASS

**Step 6: Commit**

```bash
git add backend/apps/credits/serializers.py backend/apps/credits/views.py backend/apps/credits/tests.py
git commit -m "fix: accept real credits estimate payloads"
```

## Task 2: Свести все пополнения к одному credits-domain API

**Files:**
- Modify: `backend/apps/credits/services.py`
- Modify: `backend/apps/users/admin.py`
- Modify: `backend/apps/credits/tests.py`

**Step 1: Write the failing domain test for admin topup path**

```python
from decimal import Decimal
from django.test import TestCase

from apps.credits.models import CreditsTransaction
from apps.credits.services import CreditsService
from apps.users.models import User


class CreditsServiceTopupTests(TestCase):
    def test_topup_updates_balance_and_creates_transaction(self):
        user = User.objects.create_user(username="u1", password="x")

        result = CreditsService().topup(
            user=user,
            amount=Decimal("100.00"),
            reason=CreditsTransaction.REASON_ADMIN_TOPUP,
            metadata={"source": "admin_action"},
        )

        user.refresh_from_db()
        assert user.balance == Decimal("100.00")
        assert result.balance_after == Decimal("100.00")
        assert CreditsTransaction.objects.filter(
            user=user,
            reason=CreditsTransaction.REASON_ADMIN_TOPUP,
            amount=Decimal("100.00"),
        ).count() == 1
```

**Step 2: Run test to verify it fails**

Run:

```powershell
venv\Scripts\python.exe manage.py test apps.credits.tests.CreditsServiceTopupTests -v 2
```

Expected: FAIL, метода `topup()` пока нет.

**Step 3: Add minimal domain API**

В `backend/apps/credits/services.py` добавить:

```python
@dataclass(frozen=True)
class BalanceMutationResult:
    balance_after: Decimal


@transaction.atomic
def topup(self, user, amount: Decimal, *, reason: str, metadata: dict | None = None) -> BalanceMutationResult:
    user = User.objects.select_for_update().get(pk=user.pk)
    user.balance += amount
    user.save(update_fields=["balance"])
    CreditsTransaction.objects.create(
        user=user,
        amount=amount,
        balance_after=user.balance,
        reason=reason,
        metadata=metadata or {},
    )
    return BalanceMutationResult(balance_after=user.balance)
```

**Step 4: Move admin actions to the service**

- В `backend/apps/users/admin.py` убрать прямое изменение `user.balance`.
- Сделать один helper `_topup_users(queryset, amount, action_name)`.
- Каждый admin action должен только вызвать `CreditsService().topup(...)`.

Пример:

```python
def _topup_users(self, request, queryset, amount: Decimal, action_name: str) -> None:
    service = CreditsService()
    for user in queryset:
        service.topup(
            user=user,
            amount=amount,
            reason=CreditsTransaction.REASON_ADMIN_TOPUP,
            metadata={"admin_action": action_name},
        )
```

**Step 5: Run tests**

Run:

```powershell
venv\Scripts\python.exe manage.py test apps.credits.tests.CreditsServiceTopupTests -v 2
```

Expected: PASS

**Step 6: Commit**

```bash
git add backend/apps/credits/services.py backend/apps/users/admin.py backend/apps/credits/tests.py
git commit -m "refactor: centralize admin balance topups in credits service"
```

## Task 3: Сделать debit + create element безопасным при сбоях

**Files:**
- Modify: `backend/apps/scenes/views.py`
- Modify: `backend/apps/credits/services.py`
- Modify: `backend/apps/credits/models.py`
- Modify: `backend/apps/elements/tasks.py`
- Modify: `backend/apps/credits/tests.py`
- Modify: `backend/apps/scenes/test_api.py`

**Step 1: Write failing integration test for post-debit failure**

```python
from decimal import Decimal
from unittest.mock import patch
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.credits.models import CreditsTransaction
from apps.users.models import User


class SceneGenerateDebitRollbackTests(APITestCase):
    @patch("apps.scenes.views.ElementSerializer.save", side_effect=RuntimeError("boom"))
    def test_refunds_if_element_creation_fails_after_debit(self, _save):
        user = User.objects.create_user(
            username="u1",
            password="x",
            balance=Decimal("100.00"),
        )
        self.client.force_authenticate(user=user)

        response = self.client.post(
            reverse("scene-generate", args=[1]),
            {
                "prompt": "test",
                "ai_model_id": 1,
                "generation_config": {"width": 512, "height": 512},
            },
            format="json",
        )

        user.refresh_from_db()
        assert response.status_code == 500
        assert user.balance == Decimal("100.00")
        assert CreditsTransaction.objects.filter(user=user).count() == 2
```

**Step 2: Run test to verify it fails**

Run:

```powershell
venv\Scripts\python.exe manage.py test apps.scenes.test_api.SceneGenerateDebitRollbackTests -v 2
```

Expected: FAIL, потому что сейчас деньги уже списаны, а rollback не происходит.

**Step 3: Add a dedicated rollback path in the credits domain**

Минимальный вариант без лишней миграционной сложности:

- добавить в `CreditsService` helper для rollback/refund после setup failure;
- принимать `metadata` с `operation_key`;
- если `element` еще не создан, разрешить refund по `operation_key`, а не только по `element + reason`.

Пример идейного кода:

```python
def refund_for_generation(..., metadata: dict | None = None) -> RefundResult:
    operation_key = (metadata or {}).get("operation_key")
    if operation_key and CreditsTransaction.objects.filter(
        user=user,
        reason=reason,
        metadata__operation_key=operation_key,
    ).exists():
        return RefundResult(refunded=False, balance_after=user.balance)
```

**Step 4: Wrap generate orchestration with compensating refund**

В `backend/apps/scenes/views.py`:

- сгенерировать `operation_key = uuid4().hex`;
- сделать debit;
- создать `Element`;
- сохранить в `generation_config` только то, что реально нужно для async refund сейчас;
- если после debit случился любой exception до `start_generation.delay(...)`, вызвать refund через `CreditsService` и только потом вернуть ошибку.

Пример skeleton:

```python
debit_result = credits_service.debit_for_generation(...)
try:
    element = serializer.save()
    start_generation.delay(element.id)
except Exception:
    if debit_result.ok and debit_result.cost is not None:
        credits_service.refund_for_generation(
            user=request.user,
            amount=debit_result.cost,
            reason=CreditsTransaction.REASON_GENERATION_REFUND,
            metadata={"source": "generation_setup_failure", "operation_key": operation_key},
        )
    raise
```

**Step 5: Keep async refund path compatible**

- В `backend/apps/elements/tasks.py` не ломать текущий terminal provider refund.
- Если останется хранение `_debit_amount` в `generation_config`, оставить это как временный transport detail только для async path.
- Не смешивать setup rollback и provider failure в один `reason` без `metadata.source`.

**Step 6: Run tests**

Run:

```powershell
venv\Scripts\python.exe manage.py test apps.credits.tests apps.scenes.test_api -v 2
```

Expected: PASS

**Step 7: Commit**

```bash
git add backend/apps/scenes/views.py backend/apps/credits/services.py backend/apps/credits/models.py backend/apps/elements/tasks.py backend/apps/credits/tests.py backend/apps/scenes/test_api.py
git commit -m "fix: rollback credits when generation setup fails"
```

## Task 4: Обновлять баланс после async refund на фронте

**Files:**
- Modify: `frontend/components/element/SceneWorkspace.tsx`
- Modify: `frontend/lib/hooks/useWebSocket.ts`
- Modify: `frontend/lib/store/credits.ts`

**Step 1: Identify the terminal event path**

- `SceneWorkspace.tsx` уже слушает `element_status_changed`.
- `useWebSocket.ts` уже показывает toast на `FAILED`.
- Именно в этой ветке надо триггерить `useCreditsStore.getState().loadBalance()`.

**Step 2: Add the minimal refresh on terminal failure**

В `frontend/components/element/SceneWorkspace.tsx` или в `frontend/lib/hooks/useWebSocket.ts` добавить:

```typescript
if (event.type === "element_status_changed" && event.status === "FAILED") {
  void useCreditsStore.getState().loadBalance();
}
```

Предпочтение:

- если нужен глобальный эффект для всего приложения, ставить в `useWebSocket.ts`;
- если refresh должен происходить только внутри workspace, ставить в `SceneWorkspace.tsx`.

Для текущего проекта лучше `useWebSocket.ts`, потому что он уже централизует toast + invalidate.

**Step 3: Prevent duplicate spam**

- Не добавлять toast в `loadBalance()`.
- Не дергать refresh на каждом `PROCESSING`.
- Дергать только на terminal `FAILED`, а опционально еще на `COMPLETED` для консистентности.

**Step 4: Run typecheck**

Run:

```powershell
node_modules\.bin\tsc.cmd --noEmit
```

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/components/element/SceneWorkspace.tsx frontend/lib/hooks/useWebSocket.ts frontend/lib/store/credits.ts
git commit -m "fix: refresh credits balance after async generation failure"
```

## Task 5: Финальная проверка и cleanup

**Files:**
- Modify: `docs/plans/2026-03-12-credits-review-fixes.md`

**Step 1: Run focused backend tests**

```powershell
venv\Scripts\python.exe manage.py test apps.credits.tests apps.scenes.test_api -v 2
```

Expected: PASS

**Step 2: Run Django checks**

```powershell
venv\Scripts\python.exe manage.py check
```

Expected: `System check identified no issues`

**Step 3: Run frontend typecheck**

```powershell
node_modules\.bin\tsc.cmd --noEmit
```

Expected: PASS

**Step 4: Update the review plan with actual verification notes**

В конец этого файла добавить:

```markdown
## Verification Notes

- Backend tests:
- Django check:
- Frontend typecheck:
```

**Step 5: Commit**

```bash
git add docs/plans/2026-03-12-credits-review-fixes.md
git commit -m "docs: record credits review fix verification"
```

## Scope Notes

- Этот план не внедряет внешний billing provider.
- Этот план только подготавливает систему к нему: чтобы будущий webhook "оплата прошла" вызывал один доменный метод `CreditsService.topup(...)`.
- Текущее хранение `_debit_amount` в `Element.generation_config` допустимо как промежуточное решение, но это уже кандидат на отдельную cleanup-задачу: вынести billing metadata из generation payload в отдельное поле или прямую связь с debit transaction.

## Definition of Done

- `estimate` принимает числа, строки, булевы значения, массивы и не искажает payload.
- Ни один сбой после debit не оставляет пользователя без денег и без `Element`.
- Админские пополнения больше не пишут баланс напрямую.
- Баланс в navbar обновляется после async refund без ручного refresh страницы.
- Есть тесты хотя бы на serializer contract, service topup и debit rollback.


