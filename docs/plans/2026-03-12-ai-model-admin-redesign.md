# AI Model Admin Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Внедрить централизованное администрирование AI-моделей вокруг `AIModel` с нормализованными параметрами, compile/validate pipeline и удобным pricing workflow без обязательной ручной работы с большими JSON.

**Architecture:** `AIModel` остаётся центральной сущностью. Канонический смысл параметров выносится в отдельный каталог, модель хранит bindings и overrides, а рантайм и фронтенд продолжают использовать compiled artifacts для обратной совместимости. Админка строится как workflow-first мастер с parse/bind/compile/validate шагами.

**Tech Stack:** Django ORM, Django Admin, JSONField, Django forms/inlines, Django tests, существующий DRF serializer слой, текущий schema-driven frontend.

---

### Task 1: Зафиксировать доменный контракт и legacy границы

**Files:**
- Create: `docs/plans/2026-03-12-ai-model-admin-redesign-contract-notes.md`
- Modify: `backend/apps/ai_providers/models.py`
- Modify: `backend/apps/ai_providers/services.py`
- Test: `backend/apps/ai_providers/tests.py`

**Step 1: Write the failing test**

Добавь тесты, которые фиксируют:
- текущий legacy `parameters_schema` ещё читается;
- `AIModel` сможет иметь compiled output отдельно от будущих normalized entities;
- старый dict-based seed не должен считаться новым источником истины.

```python
class AIModelContractBoundaryTest(TestCase):
    def test_legacy_parameters_schema_is_runtime_artifact_not_primary_source(self):
        model = AIModel.objects.create(
            ...,
            parameters_schema=[{"request_key": "resolution", "ui_semantic": "resolution"}],
            pricing_schema={"fixed_cost": "5.00"},
        )
        self.assertIsInstance(model.parameters_schema, list)
```

**Step 2: Run test to verify it fails**

Run: `python manage.py test apps.ai_providers.tests -v 2`
Expected: FAIL on missing normalized contract helpers and/or missing separation comments.

**Step 3: Write minimal implementation**

Добавь в `models.py` и/или `services.py` только контрактные helper-методы и комментарии-инварианты:
- legacy JSON = compiled artifact;
- normalized source будет добавлен рядом;
- старое потребление не ломаем.

**Step 4: Run test to verify it passes**

Run: `python manage.py test apps.ai_providers.tests -v 2`
Expected: PASS

**Step 5: Commit**

```bash
git add docs/plans/2026-03-12-ai-model-admin-redesign-contract-notes.md backend/apps/ai_providers/models.py backend/apps/ai_providers/services.py backend/apps/ai_providers/tests.py
git commit -m "test: lock ai model legacy contract boundaries"
```

### Task 2: Добавить нормализованные сущности параметров и pricing

**Files:**
- Modify: `backend/apps/ai_providers/models.py`
- Create: `backend/apps/ai_providers/migrations/0004_ai_model_admin_redesign_core.py`
- Test: `backend/apps/ai_providers/tests.py`

**Step 1: Write the failing test**

Добавь тесты на новые модели:
- `CanonicalParameter`
- `ModelParameterBinding`
- `ModelPricingConfig` или `PricingProfile`

```python
def test_create_canonical_parameter_with_aliases(self):
    param = CanonicalParameter.objects.create(
        code="duration",
        ui_semantic="duration",
        value_type="enum",
        aliases=["videoDuration", "durationSeconds"],
    )
    assert param.code == "duration"
```

**Step 2: Run test to verify it fails**

Run: `python manage.py test apps.ai_providers.tests -v 2`
Expected: FAIL with missing models/tables

**Step 3: Write minimal implementation**

Добавь модели и миграцию:
- `CanonicalParameter`
- `ModelParameterBinding`
- `ModelPricingConfig` или `PricingProfile`
- поля compiled snapshot на `AIModel`, если нужны для preview/cache

Минимально достаточные поля:
- codes/aliases/ui_semantic/value_type/default_ui_control
- request placeholder/path
- overrides
- pricing mode/dimensions/raw_lookup_json

**Step 4: Run test to verify it passes**

Run: `python manage.py test apps.ai_providers.tests -v 2`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/apps/ai_providers/models.py backend/apps/ai_providers/migrations/0004_ai_model_admin_redesign_core.py backend/apps/ai_providers/tests.py
git commit -m "feat: add normalized ai model admin entities"
```

### Task 3: Реализовать compile/validate pipeline

**Files:**
- Create: `backend/apps/ai_providers/compiler.py`
- Create: `backend/apps/ai_providers/validators.py`
- Modify: `backend/apps/ai_providers/services.py`
- Test: `backend/apps/ai_providers/tests.py`
- Test: `backend/apps/credits/tests.py`

**Step 1: Write the failing test**

Покрой тестами сценарии:
- parse placeholders из `request_schema`;
- auto-match alias;
- compile `parameters_schema` из bindings;
- compile pricing lookup;
- validation error при unresolved placeholder;
- validation error при pricing dimension, не подключённом к модели.

```python
def test_compile_parameters_schema_from_bindings(self):
    compiled = compile_model_config(ai_model)
    self.assertEqual(compiled.parameters_schema[0]["request_key"], "resolution")
    self.assertEqual(compiled.parameters_schema[0]["ui_semantic"], "resolution")
```

**Step 2: Run test to verify it fails**

Run: `python manage.py test apps.ai_providers.tests apps.credits.tests -v 2`
Expected: FAIL with missing compiler/validator behavior

**Step 3: Write minimal implementation**

Добавь функции:
- `extract_placeholders(request_schema)`
- `match_placeholder_to_canonical(placeholder, model_type)`
- `compile_parameters_schema(ai_model)`
- `compile_pricing_payload(ai_model)`
- `validate_model_admin_config(ai_model)`

Сделай ошибки предметными и русскими.

**Step 4: Run test to verify it passes**

Run: `python manage.py test apps.ai_providers.tests apps.credits.tests -v 2`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/apps/ai_providers/compiler.py backend/apps/ai_providers/validators.py backend/apps/ai_providers/services.py backend/apps/ai_providers/tests.py backend/apps/credits/tests.py
git commit -m "feat: add ai model compile and validation pipeline"
```

### Task 4: Подключить compile pipeline к runtime без ломки фронта

**Files:**
- Modify: `backend/apps/ai_providers/serializers.py`
- Modify: `backend/apps/elements/services.py`
- Modify: `backend/apps/elements/tasks.py`
- Modify: `backend/apps/credits/services.py`
- Test: `backend/apps/scenes/test_api.py`
- Test: `backend/apps/credits/tests.py`

**Step 1: Write the failing test**

Покрой интеграционные сценарии:
- фронтенд по-прежнему получает compiled `parameters_schema`;
- генерация использует compiled mapping и не требует ручной синхронизации;
- credits estimate/debit работает с compiled pricing payload.

```python
def test_ai_model_serializer_returns_compiled_parameters_schema(self):
    data = AIModelSerializer(instance=model).data
    self.assertEqual(data["parameters_schema"][0]["ui_semantic"], "duration")
```

**Step 2: Run test to verify it fails**

Run: `python manage.py test apps.scenes.test_api apps.credits.tests -v 2`
Expected: FAIL on old direct JSON assumptions

**Step 3: Write minimal implementation**

Подключи compiler в точки чтения:
- serializer отдаёт compiled shape;
- generation/request substitution работает с bindings/template;
- credits service читает compiled pricing config.

Сохрани fallback на legacy JSON, пока миграция не завершена.

**Step 4: Run test to verify it passes**

Run: `python manage.py test apps.scenes.test_api apps.credits.tests -v 2`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/apps/ai_providers/serializers.py backend/apps/elements/services.py backend/apps/elements/tasks.py backend/apps/credits/services.py backend/apps/scenes/test_api.py backend/apps/credits/tests.py
git commit -m "feat: serve compiled ai model config at runtime"
```

### Task 5: Собрать workflow-first Django Admin для AIModel

**Files:**
- Modify: `backend/apps/ai_providers/admin.py`
- Create: `backend/apps/ai_providers/admin_forms.py`
- Create: `backend/apps/ai_providers/admin_inlines.py`
- Test: `backend/apps/ai_providers/tests.py`

**Step 1: Write the failing test**

Добавь admin-level tests на:
- разделение fieldsets по шагам;
- inline bindings;
- warnings/errors preview;
- сохранение модели через форму с compile/validate.

```python
def test_ai_model_admin_form_rejects_unbound_placeholder(self):
    form = AIModelAdminForm(data={...})
    self.assertFalse(form.is_valid())
    self.assertIn("не связан с каноническим параметром", form.errors["request_schema"])
```

**Step 2: Run test to verify it fails**

Run: `python manage.py test apps.ai_providers.tests -v 2`
Expected: FAIL with missing admin forms/inlines

**Step 3: Write minimal implementation**

Сделай админку по блокам:
- identity;
- request mapping;
- ui parameter overrides;
- pricing;
- advanced mode;
- compiled preview.

Добавь inline bindings и form-level validation.

**Step 4: Run test to verify it passes**

Run: `python manage.py test apps.ai_providers.tests -v 2`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/apps/ai_providers/admin.py backend/apps/ai_providers/admin_forms.py backend/apps/ai_providers/admin_inlines.py backend/apps/ai_providers/tests.py
git commit -m "feat: redesign ai model admin workflow"
```

### Task 6: Реализовать pricing editor modes и bulk/template workflow

**Files:**
- Modify: `backend/apps/ai_providers/admin.py`
- Modify: `backend/apps/ai_providers/admin_forms.py`
- Create: `backend/apps/ai_providers/pricing_tools.py`
- Test: `backend/apps/ai_providers/tests.py`

**Step 1: Write the failing test**

Покрой сценарии:
- generate pricing template по dimensions;
- import bulk JSON;
- reject invalid lookup keys;
- reject unknown dimension values;
- accept large matrix without manual grid-edit.

```python
def test_generate_pricing_template_from_dimensions(self):
    payload = generate_pricing_template(["resolution", "duration"], value_map={
        "resolution": ["720p", "1080p"],
        "duration": [5, 10],
    })
    self.assertIn("720p|5", payload["costs"])
```

**Step 2: Run test to verify it fails**

Run: `python manage.py test apps.ai_providers.tests -v 2`
Expected: FAIL with missing pricing tools

**Step 3: Write minimal implementation**

Сделай:
- template generator;
- bulk JSON parser/validator;
- form actions/helpers для pricing modes.

UI может быть сначала простым: textarea + helper buttons, без избыточного JS.

**Step 4: Run test to verify it passes**

Run: `python manage.py test apps.ai_providers.tests -v 2`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/apps/ai_providers/admin.py backend/apps/ai_providers/admin_forms.py backend/apps/ai_providers/pricing_tools.py backend/apps/ai_providers/tests.py
git commit -m "feat: add bulk and template pricing workflow"
```

### Task 7: Мигрировать существующие модели и сиды

**Files:**
- Create: `backend/apps/ai_providers/migrations/0005_backfill_ai_model_admin_redesign.py`
- Modify: `backend/apps/ai_providers/management/commands/setup_kie_ai.py`
- Modify: `backend/setup_kie_ai.py`
- Test: `backend/apps/ai_providers/tests.py`

**Step 1: Write the failing test**

Добавь тесты на backfill:
- legacy модель без bindings корректно мигрируется;
- старый сид создаёт normalized records;
- compiled shape после миграции совпадает с ожидаемым runtime output.

```python
def test_backfill_legacy_model_into_bindings(self):
    legacy_model = AIModel.objects.create(...)
    backfill_ai_model(legacy_model)
    self.assertEqual(legacy_model.parameter_bindings.count(), 3)
```

**Step 2: Run test to verify it fails**

Run: `python manage.py test apps.ai_providers.tests -v 2`
Expected: FAIL with missing backfill behavior

**Step 3: Write minimal implementation**

Добавь data migration и обнови сиды так, чтобы:
- они создавали `CanonicalParameter` при необходимости;
- создавали bindings;
- задавали pricing config;
- при необходимости компилировали legacy JSON.

**Step 4: Run test to verify it passes**

Run: `python manage.py test apps.ai_providers.tests -v 2`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/apps/ai_providers/migrations/0005_backfill_ai_model_admin_redesign.py backend/apps/ai_providers/management/commands/setup_kie_ai.py backend/setup_kie_ai.py backend/apps/ai_providers/tests.py
git commit -m "feat: backfill ai model normalized admin data"
```

### Task 8: Документация, smoke verification и cleanup

**Files:**
- Modify: `.cursor/docs/BACKEND_AI_MODEL_SETUP.md`
- Modify: `ARCHITECTURE_OVERVIEW.md`
- Modify: `docs/plans/2026-03-12-ai-model-admin-redesign-design.md`
- Create: `docs/plans/2026-03-12-ai-model-admin-redesign-verification.md`

**Step 1: Write the failing test**

Для этой задачи вместо unit-test зафиксируй verification checklist:
- новая модель заводится из админки без большого raw JSON;
- pricing bulk import работает;
- compiled output стабилен;
- generation и estimate не ломаются.

**Step 2: Run verification commands to capture current state**

Run:
- `python manage.py test apps.ai_providers.tests -v 2`
- `python manage.py test apps.credits.tests -v 2`
- `python manage.py test apps.scenes.test_api -v 2`

Expected: PASS

**Step 3: Write minimal documentation updates**

Обнови setup guide так, чтобы новый основной путь был:
- выбрать/создать canonical parameter;
- связать placeholder;
- подтвердить compiled preview;
- задать pricing через visual/bulk/template.

**Step 4: Run final verification again**

Run:
- `python manage.py test apps.ai_providers.tests apps.credits.tests apps.scenes.test_api -v 2`
Expected: PASS

**Step 5: Commit**

```bash
git add .cursor/docs/BACKEND_AI_MODEL_SETUP.md ARCHITECTURE_OVERVIEW.md docs/plans/2026-03-12-ai-model-admin-redesign-design.md docs/plans/2026-03-12-ai-model-admin-redesign-verification.md
git commit -m "docs: document ai model admin redesign workflow"
```

## Implementation Notes

- Не переписывать фронтенд первым шагом. Сначала обеспечить compiled compatibility.
- Для pricing bulk режима сначала достаточно server-side textarea + validation, без тяжёлого кастомного JS UI.
- Alias auto-match должен предлагать привязку, но не молча применять рискованные соответствия.
- `setup_kie_ai.py` и legacy tests нужно привести к одному новому канону, иначе проект останется в полу-мигрированном состоянии.
- `parameters_schema` и `pricing_schema` можно временно оставить как persisted cache/runtime snapshot.

## Suggested Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7
8. Task 8