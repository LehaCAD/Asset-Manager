# AIModel Workflow-First Admin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn `AIModel` admin into a workflow-first editor where an administrator can configure request placeholders, parameter mappings, pricing, and compiled preview without understanding ORM internals or editing raw JSON as the primary path.

**Architecture:** Keep the existing backend contract intact: `CanonicalParameter`, `ModelParameterBinding`, `ModelPricingConfig`, compiler/validator, runtime compatibility, backfill, and `setup_kie_ai` remain the source of truth. Replace the current raw-admin UX with a custom `AIModel` admin workflow built from a custom change form template, synthetic form fields, helper/view-model builders, and a thin layer of admin JS. Advanced JSON editing remains available as a fallback section, not the main path.

**Tech Stack:** Django Admin, Django `ModelAdmin`, `ModelForm`, custom admin templates, lightweight admin JavaScript, existing compiler/validator helpers, Django tests.

---

### Task 1: Lock the UX contract with admin workflow tests

**Files:**
- Modify: `backend/apps/ai_providers/tests.py`

**Step 1: Write the failing tests**

Add admin-focused tests that describe the desired workflow instead of ORM behavior:

- change form exposes workflow sections in human order
- request schema placeholder discovery is surfaced in admin context
- placeholder rows show suggestion/mapping state
- normal mode does not require manual `request_path`
- pricing is presented as modes, not just raw `pricing_schema`
- compiled preview remains present
- advanced mode is separated from the main workflow

Example test targets:

```python
def test_ai_model_admin_change_view_exposes_workflow_context(self):
    response = self.client.get(self.change_url)
    self.assertContains(response, "Request Template")
    self.assertContains(response, "Parameter Mapping")
    self.assertContains(response, "Pricing")
    self.assertContains(response, "Compiled Preview")
    self.assertContains(response, "Advanced Mode")
```

```python
def test_ai_model_admin_builds_placeholder_rows_for_nano_banana_schema(self):
    context = admin.get_workflow_context(request, obj=model)
    placeholders = [row["placeholder"] for row in context["mapping_rows"]]
    self.assertEqual(
        placeholders,
        ["prompt", "resolution", "input_urls", "aspect_ratio", "google_search", "output_format", "callback_url"],
    )
```

**Step 2: Run tests to verify they fail**

Run: `python manage.py test apps.ai_providers.tests -v 2 --keepdb`

Expected: FAIL because the current admin has fieldsets and raw inlines only, with no workflow context or custom rendering.

**Step 3: Add only minimal scaffolding identifiers if needed**

If test setup needs it, add:
- admin test user factory/setup
- helper to resolve `AIModel` admin change URL
- fixture for nano-banana-like request schema

**Step 4: Run tests again**

Run: `python manage.py test apps.ai_providers.tests -v 2 --keepdb`

Expected: still FAIL, but now the failure is isolated to missing workflow implementation.

**Step 5: Commit**

```bash
git add backend/apps/ai_providers/tests.py
git commit -m "test: lock ai model admin workflow contract"
```

---

### Task 2: Introduce a reusable admin workflow helper layer

**Files:**
- Create: `backend/apps/ai_providers/admin_workflow.py`
- Modify: `backend/apps/ai_providers/admin.py`
- Modify: `backend/apps/ai_providers/tests.py`

**Step 1: Write the failing tests**

Add helper-level tests for a workflow view model:

- ordered placeholder discovery
- placeholder status classification: `mapped`, `suggested`, `needs_mapping`, `system`
- auto-suggestion from canonical aliases/codes
- path extraction from `request_schema`
- pricing summary and compiled preview summary

Example:

```python
def test_build_mapping_rows_marks_unmapped_placeholder(self):
    rows = build_mapping_rows(model)
    row = next(row for row in rows if row["placeholder"] == "aspect_ratio")
    self.assertEqual(row["status"], "needs_mapping")
```

**Step 2: Run tests to verify they fail**

Run: `python manage.py test apps.ai_providers.tests -v 2 --keepdb`

Expected: FAIL on missing helper module/functions.

**Step 3: Write minimal implementation**

Create a helper module that turns existing backend state into a UI-ready workflow context.

Required functions:

- `discover_placeholder_entries(request_schema)`
- `build_mapping_rows(ai_model)`
- `build_pricing_context(ai_model)`
- `build_compiled_preview_context(ai_model)`
- `build_admin_workflow_context(ai_model)`

Design rules:

- preserve placeholder order from `request_schema`
- mark system placeholders such as `prompt` and `callback_url`
- derive `request_path` automatically for normal mode display
- never mutate DB state here; helpers only build view models

**Step 4: Run tests to verify they pass**

Run: `python manage.py test apps.ai_providers.tests -v 2 --keepdb`

Expected: PASS for helper coverage.

**Step 5: Commit**

```bash
git add backend/apps/ai_providers/admin_workflow.py backend/apps/ai_providers/admin.py backend/apps/ai_providers/tests.py
git commit -m "feat: add ai model admin workflow helper layer"
```

---

### Task 3: Replace raw change form with a workflow-first admin page

**Files:**
- Modify: `backend/apps/ai_providers/admin.py`
- Create: `backend/templates/admin/ai_providers/aimodel/change_form.html`
- Create: `backend/templates/admin/ai_providers/aimodel/includes/workflow_summary.html`
- Create: `backend/templates/admin/ai_providers/aimodel/includes/mapping_table.html`
- Create: `backend/templates/admin/ai_providers/aimodel/includes/pricing_panel.html`
- Create: `backend/templates/admin/ai_providers/aimodel/includes/compiled_preview.html`
- Modify: `backend/apps/ai_providers/tests.py`

**Step 1: Write the failing tests**

Add response-content tests that assert the presence of workflow sections and absence of raw-inline-first UX.

Examples:

```python
def test_change_form_renders_found_placeholders_panel(self):
    response = self.client.get(self.change_url)
    self.assertContains(response, "Found placeholders")
    self.assertContains(response, "Needs attention")
```

```python
def test_change_form_shows_mapping_table_not_raw_binding_inline_copy(self):
    response = self.client.get(self.change_url)
    self.assertContains(response, "Suggested canonical parameter")
    self.assertNotContains(response, "Model parameter bindings")
```

**Step 2: Run tests to verify they fail**

Run: `python manage.py test apps.ai_providers.tests -v 2 --keepdb`

Expected: FAIL because default admin template is still used.

**Step 3: Write minimal implementation**

Implement:

- `change_form_template` on `AIModelAdmin`
- override `render_change_form()` or `changeform_view()` to inject workflow context
- use templates to render:
  - Step 1 `Request Template`
  - Step 2 `Parameter Mapping`
  - Step 3 `Pricing`
  - Step 4 `Compiled Preview`
  - Step 5 `Advanced Mode`
- demote raw inlines from the primary screen; if kept, render them only inside Advanced or hide them from standard rendering

Do not move persistence logic into the template. Template only renders the workflow view model.

**Step 4: Run tests to verify they pass**

Run: `python manage.py test apps.ai_providers.tests -v 2 --keepdb`

Expected: PASS for template rendering expectations.

**Step 5: Commit**

```bash
git add backend/apps/ai_providers/admin.py backend/templates/admin/ai_providers/aimodel/change_form.html backend/templates/admin/ai_providers/aimodel/includes/workflow_summary.html backend/templates/admin/ai_providers/aimodel/includes/mapping_table.html backend/templates/admin/ai_providers/aimodel/includes/pricing_panel.html backend/templates/admin/ai_providers/aimodel/includes/compiled_preview.html backend/apps/ai_providers/tests.py
git commit -m "feat: add workflow-first ai model admin change form"
```

---

### Task 4: Replace raw binding inline editing with a workflow form payload

**Files:**
- Modify: `backend/apps/ai_providers/admin_forms.py`
- Modify: `backend/apps/ai_providers/admin.py`
- Modify: `backend/apps/ai_providers/admin_workflow.py`
- Modify: `backend/apps/ai_providers/tests.py`

**Step 1: Write the failing tests**

Add form-save tests that post workflow data and verify normalized records are updated correctly.

Scenarios:

- create/update mapping rows from workflow payload
- auto-fill `request_path` from discovered locations
- preserve existing binding overrides
- unresolved required placeholders block save
- system placeholders do not require bindings

Example:

```python
def test_admin_form_saves_mapping_rows_into_model_parameter_bindings(self):
    form = AIModelAdminForm(data={...workflow payload...}, instance=model)
    self.assertTrue(form.is_valid())
    saved = form.save()
    self.assertTrue(saved.parameter_bindings.filter(placeholder="aspect_ratio").exists())
```

**Step 2: Run tests to verify they fail**

Run: `python manage.py test apps.ai_providers.tests -v 2 --keepdb`

Expected: FAIL because current form knows only model fields and raw JSON.

**Step 3: Write minimal implementation**

Extend `AIModelAdminForm` with synthetic workflow fields such as:

- `mapping_payload`
- `pricing_mode`
- `pricing_bulk_json`
- `generate_pricing_template`
- optional hidden JSON snapshot field for client-side updates

Responsibilities:

- parse mapping payload
- validate unresolved placeholders
- write `ModelParameterBinding` records
- keep existing compiler/validator as the final authority
- avoid requiring manual `request_path` in normal mode
- leave raw fields available only as advanced fallback

If form save becomes too crowded, add a small service/helper used by the form.

**Step 4: Run tests to verify they pass**

Run: `python manage.py test apps.ai_providers.tests -v 2 --keepdb`

Expected: PASS for form persistence behavior.

**Step 5: Commit**

```bash
git add backend/apps/ai_providers/admin_forms.py backend/apps/ai_providers/admin.py backend/apps/ai_providers/admin_workflow.py backend/apps/ai_providers/tests.py
git commit -m "feat: save ai model workflow mappings through admin form"
```

---

### Task 5: Build a pricing workbench around modes instead of raw schema editing

**Files:**
- Modify: `backend/apps/ai_providers/admin_forms.py`
- Modify: `backend/apps/ai_providers/admin_workflow.py`
- Modify: `backend/apps/ai_providers/admin.py`
- Modify: `backend/apps/ai_providers/pricing_tools.py`
- Modify: `backend/apps/ai_providers/tests.py`

**Step 1: Write the failing tests**

Cover:

- fixed cost mode updates `ModelPricingConfig`
- lookup mode accepts only dimensions bound to this model
- bulk JSON mode parses and validates input
- generate template uses option values from mapped canonical parameters
- compiled pricing preview updates after save

Example:

```python
def test_admin_form_generates_lookup_template_from_bound_dimensions(self):
    template = build_pricing_template_for_model(model, ["resolution", "aspect_ratio"])
    self.assertIn("16:9", str(template))
```

```python
def test_admin_form_rejects_pricing_dimension_not_bound_to_model(self):
    form = AIModelAdminForm(data={...})
    self.assertFalse(form.is_valid())
    self.assertIn("not bound", str(form.errors))
```

**Step 2: Run tests to verify they fail**

Run: `python manage.py test apps.ai_providers.tests -v 2 --keepdb`

Expected: FAIL because pricing is still centered on raw `pricing_schema`.

**Step 3: Write minimal implementation**

Implement pricing workflow modes:

- `fixed`
- `lookup`
- `bulk_json`
- `generate_template`

Rules:

- dimensions come only from mapped/bindable canonical parameters
- `bulk_json` uses existing parsing/validation utilities
- generated template is an accelerator, not a persistence format by itself
- compiled pricing preview is shown after save using existing compiler logic

Keep raw `pricing_schema` out of the primary workflow.

**Step 4: Run tests to verify they pass**

Run: `python manage.py test apps.ai_providers.tests -v 2 --keepdb`

Expected: PASS for pricing mode behavior.

**Step 5: Commit**

```bash
git add backend/apps/ai_providers/admin_forms.py backend/apps/ai_providers/admin_workflow.py backend/apps/ai_providers/admin.py backend/apps/ai_providers/pricing_tools.py backend/apps/ai_providers/tests.py
git commit -m "feat: add pricing workbench to ai model admin"
```

---

### Task 6: Add lightweight admin JS for usability, not business logic

**Files:**
- Create: `backend/static/admin/ai_providers/aimodel_workflow.js`
- Create: `backend/static/admin/ai_providers/aimodel_workflow.css`
- Modify: `backend/apps/ai_providers/admin.py`
- Modify: `backend/templates/admin/ai_providers/aimodel/change_form.html`
- Modify: `backend/apps/ai_providers/tests.py`

**Step 1: Write the failing tests**

Add tests for static asset inclusion and server-rendered fallback behavior.

Scenarios:

- workflow assets are included on `AIModel` admin only
- page still renders useful workflow sections without JS
- JS enhances UX but does not become the only source of truth

Example:

```python
def test_ai_model_admin_includes_workflow_assets(self):
    response = self.client.get(self.change_url)
    self.assertContains(response, "aimodel_workflow.js")
    self.assertContains(response, "aimodel_workflow.css")
```

**Step 2: Run tests to verify they fail**

Run: `python manage.py test apps.ai_providers.tests -v 2 --keepdb`

Expected: FAIL because no custom media is registered yet.

**Step 3: Write minimal implementation**

Use JS only for:

- showing/hiding pricing mode panels
- highlighting unmapped placeholders
- copying generated pricing template into bulk editor
- collapsing/expanding advanced mode
- optionally showing live counts from already-rendered payload

Do not put compile/validation/business rules into JS.

**Step 4: Run tests to verify they pass**

Run: `python manage.py test apps.ai_providers.tests -v 2 --keepdb`

Expected: PASS.

**Step 5: Commit**

```bash
git add backend/static/admin/ai_providers/aimodel_workflow.js backend/static/admin/ai_providers/aimodel_workflow.css backend/apps/ai_providers/admin.py backend/templates/admin/ai_providers/aimodel/change_form.html backend/apps/ai_providers/tests.py
git commit -m "feat: add lightweight ai model admin workflow assets"
```

---

### Task 7: Verify nano-banana end-to-end in admin terms

**Files:**
- Modify: `backend/apps/ai_providers/tests.py`
- Create: `docs/plans/2026-03-12-ai-model-admin-workflow-first-verification.md`

**Step 1: Write the failing tests**

Add a focused scenario around the exact nano-banana payload.

Required assertions:

- discovered placeholders are:
  - `prompt`
  - `resolution`
  - `input_urls`
  - `aspect_ratio`
  - `google_search`
  - `output_format`
  - `callback_url`
- mapping suggestions are reasonable
- pricing panel starts empty but usable
- compiled preview remains visible
- advanced JSON is present but not primary

Example:

```python
def test_nano_banana_admin_workflow_shows_expected_placeholders(self):
    response = self.client.get(self.change_url)
    for placeholder in ["resolution", "input_urls", "aspect_ratio", "google_search", "output_format"]:
        self.assertContains(response, placeholder)
```

**Step 2: Run tests to verify they fail if UX regresses**

Run: `python manage.py test apps.ai_providers.tests -v 2 --keepdb`

Expected: PASS once implementation is complete; keep this as the regression anchor.

**Step 3: Write manual verification checklist**

Document manual checks:

- open `AIModel` admin for nano-banana
- paste/edit request schema
- confirm placeholder discovery
- map unresolved placeholders
- set pricing via fixed or bulk mode
- confirm compiled preview
- confirm advanced mode stays secondary

**Step 4: Run final verification**

Run:
- `python manage.py test apps.ai_providers.tests -v 2 --keepdb`
- `python manage.py test apps.credits.tests -v 2 --keepdb`
- `python manage.py test apps.scenes.test_api -v 2 --keepdb`

Expected: PASS

**Step 5: Commit**

```bash
git add backend/apps/ai_providers/tests.py docs/plans/2026-03-12-ai-model-admin-workflow-first-verification.md
git commit -m "test: verify nano banana admin workflow"
```

---

## Implementation Notes

- Do not re-open the backend architecture. Treat models, migrations, compiler, validator, runtime compatibility, backfill, and `setup_kie_ai` as fixed constraints.
- The primary admin object is still `AIModel`; the workflow is a UI layer over existing normalized records.
- `ModelParameterBindingInline` and raw `pricing_schema` are no longer the main authoring path.
- `request_path` should be discoverable and auto-filled from `request_schema`; manual editing belongs in Advanced Mode only.
- The reusable abstraction is:
  - `Template`
  - `Discovery`
  - `Semantic mapping`
  - `Derived config`
  - `Preview`
  - `Advanced fallback`
- Keep the first version server-rendered and robust. JS should improve ergonomics, not carry business logic.
- The highest-value tests are admin behavior tests, not more compiler tests.

## Suggested Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7
