# Image Inputs Schema Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visual admin editor (Step 5) for `image_inputs_schema` — supporting both the simple flat-list format and the new groups format with dependencies, mutual exclusivity, and `collect_to` / `extra_params`.

**Architecture:** The schema lives in `AIModel.image_inputs_schema` (JSONField). Two formats:
- **Simple** (list) — flat slot list, backward-compatible with current models
- **Groups** (object with `mode: "groups"`) — named groups with slots, dependencies, `collect_to`, `exclusive_with`, `extra_params`, `no_images_params`

Backend validates on save. Admin UI provides a visual editor with JSON toggle. Serializer passes through as-is. No frontend changes in this block.

**Tech Stack:** Django 5, Django Admin (custom template + JS), Python validators

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/apps/ai_providers/validators.py` | Modify | Add `validate_image_inputs_schema()` |
| `backend/apps/ai_providers/models.py` | Modify | Update `help_text` on `image_inputs_schema` field |
| `backend/apps/ai_providers/admin.py` | Modify | Add `image_inputs_schema` to `get_workflow_context()`, register new JS/CSS |
| `backend/apps/ai_providers/admin_forms.py` | Modify | Add hidden field `image_inputs_payload`, validation in `clean()`, save logic |
| `backend/templates/admin/ai_providers/aimodel/change_form.html` | Modify | Add Step 5 section for image inputs |
| `backend/templates/admin/ai_providers/aimodel/includes/image_inputs_panel.html` | Create | Visual editor template |
| `backend/static/admin/ai_providers/aimodel_image_inputs.js` | Create | Editor JS: groups, slots, dependencies, JSON toggle, serialization |
| `backend/static/admin/ai_providers/aimodel_workflow.css` | Modify | Add styles for image inputs editor (reuse existing design system) |
| `backend/apps/ai_providers/tests.py` | Modify | Add tests for validator + form save |

---

## Task 1: Validator — `validate_image_inputs_schema()`

**Files:**
- Modify: `backend/apps/ai_providers/validators.py`
- Modify: `backend/apps/ai_providers/tests.py`

### Step 1.1: Write failing tests for the validator

- [ ] Add test class `ImageInputsSchemaValidatorTest` to `tests.py`

```python
from apps.ai_providers.validators import validate_image_inputs_schema
from django.core.exceptions import ValidationError

class ImageInputsSchemaValidatorTest(TestCase):
    """Tests for validate_image_inputs_schema()."""

    # ── Simple format (list) ──

    def test_empty_list_is_valid(self):
        validate_image_inputs_schema([])

    def test_simple_slot_list_valid(self):
        validate_image_inputs_schema([
            {"key": "input_urls", "label": "Выберите до 4 изображений", "min": 0, "max": 4},
        ])

    def test_simple_slot_missing_key_raises(self):
        with self.assertRaises(ValidationError):
            validate_image_inputs_schema([
                {"label": "No key", "min": 0, "max": 4},
            ])

    def test_simple_slot_missing_label_raises(self):
        with self.assertRaises(ValidationError):
            validate_image_inputs_schema([
                {"key": "x", "min": 0, "max": 4},
            ])

    def test_simple_slot_missing_max_raises(self):
        with self.assertRaises(ValidationError):
            validate_image_inputs_schema([
                {"key": "x", "label": "X"},
            ])

    def test_simple_slot_min_greater_than_max_raises(self):
        with self.assertRaises(ValidationError):
            validate_image_inputs_schema([
                {"key": "x", "label": "X", "min": 5, "max": 2},
            ])

    def test_simple_slot_duplicate_keys_raises(self):
        with self.assertRaises(ValidationError):
            validate_image_inputs_schema([
                {"key": "x", "label": "X", "min": 0, "max": 1},
                {"key": "x", "label": "X2", "min": 0, "max": 1},
            ])

    # ── Groups format ──

    def test_groups_format_valid_veo(self):
        validate_image_inputs_schema({
            "mode": "groups",
            "no_images_params": {"generation_type": "TEXT_2_VIDEO", "image_urls": []},
            "groups": [
                {
                    "key": "frames",
                    "label": "Кадры",
                    "collect_to": "image_urls",
                    "exclusive_with": ["references"],
                    "extra_params": {"generation_type": "FIRST_AND_LAST_FRAMES_2_VIDEO"},
                    "slots": [
                        {"key": "start_frame", "label": "Начальный кадр", "min": 1, "max": 1},
                        {"key": "end_frame", "label": "Конечный кадр", "min": 0, "max": 1, "depends_on": "start_frame"},
                    ],
                },
                {
                    "key": "references",
                    "label": "Референсы",
                    "collect_to": "image_urls",
                    "exclusive_with": ["frames"],
                    "extra_params": {"generation_type": "REFERENCE_2_VIDEO"},
                    "slots": [
                        {"key": "ref_images", "label": "Референсы", "min": 1, "max": 3},
                    ],
                },
            ],
        })

    def test_groups_format_empty_groups_raises(self):
        with self.assertRaises(ValidationError):
            validate_image_inputs_schema({
                "mode": "groups",
                "groups": [],
            })

    def test_groups_format_group_missing_key_raises(self):
        with self.assertRaises(ValidationError):
            validate_image_inputs_schema({
                "mode": "groups",
                "groups": [{"slots": [{"key": "x", "label": "X", "max": 1}]}],
            })

    def test_groups_format_group_missing_slots_raises(self):
        with self.assertRaises(ValidationError):
            validate_image_inputs_schema({
                "mode": "groups",
                "groups": [{"key": "g1"}],
            })

    def test_groups_format_empty_slots_raises(self):
        with self.assertRaises(ValidationError):
            validate_image_inputs_schema({
                "mode": "groups",
                "groups": [{"key": "g1", "slots": []}],
            })

    def test_groups_format_duplicate_group_keys_raises(self):
        with self.assertRaises(ValidationError):
            validate_image_inputs_schema({
                "mode": "groups",
                "groups": [
                    {"key": "g1", "slots": [{"key": "s1", "label": "S1", "max": 1}]},
                    {"key": "g1", "slots": [{"key": "s2", "label": "S2", "max": 1}]},
                ],
            })

    def test_groups_format_duplicate_slot_keys_across_groups_raises(self):
        with self.assertRaises(ValidationError):
            validate_image_inputs_schema({
                "mode": "groups",
                "groups": [
                    {"key": "g1", "slots": [{"key": "same", "label": "S1", "max": 1}]},
                    {"key": "g2", "slots": [{"key": "same", "label": "S2", "max": 1}]},
                ],
            })

    def test_groups_format_depends_on_nonexistent_slot_raises(self):
        with self.assertRaises(ValidationError):
            validate_image_inputs_schema({
                "mode": "groups",
                "groups": [{
                    "key": "g1",
                    "slots": [
                        {"key": "s1", "label": "S1", "max": 1, "depends_on": "nonexistent"},
                    ],
                }],
            })

    def test_groups_format_exclusive_with_nonexistent_group_raises(self):
        with self.assertRaises(ValidationError):
            validate_image_inputs_schema({
                "mode": "groups",
                "groups": [{
                    "key": "g1",
                    "exclusive_with": ["nonexistent"],
                    "slots": [{"key": "s1", "label": "S1", "max": 1}],
                }],
            })

    def test_groups_format_exclusive_with_self_raises(self):
        with self.assertRaises(ValidationError):
            validate_image_inputs_schema({
                "mode": "groups",
                "groups": [{
                    "key": "g1",
                    "exclusive_with": ["g1"],
                    "slots": [{"key": "s1", "label": "S1", "max": 1}],
                }],
            })

    def test_groups_single_group_valid(self):
        """One group, no exclusive_with — valid (VEO Quality case)."""
        validate_image_inputs_schema({
            "mode": "groups",
            "no_images_params": {"generation_type": "TEXT_2_VIDEO"},
            "groups": [{
                "key": "frames",
                "collect_to": "image_urls",
                "extra_params": {"generation_type": "FIRST_AND_LAST_FRAMES_2_VIDEO"},
                "slots": [
                    {"key": "start_frame", "label": "Начальный кадр", "min": 1, "max": 1},
                ],
            }],
        })

    # ── Invalid top-level ──

    def test_string_raises(self):
        with self.assertRaises(ValidationError):
            validate_image_inputs_schema("invalid")

    def test_dict_without_mode_raises(self):
        with self.assertRaises(ValidationError):
            validate_image_inputs_schema({"foo": "bar"})

    def test_none_is_treated_as_empty_list(self):
        validate_image_inputs_schema(None)
```

- [ ] Run tests to verify they fail

```bash
docker compose exec backend python manage.py test apps.ai_providers.tests.ImageInputsSchemaValidatorTest -v2
```

Expected: `ImportError` or `AttributeError` — function doesn't exist yet.

### Step 1.2: Implement the validator

- [ ] Add `validate_image_inputs_schema` to `backend/apps/ai_providers/validators.py`

```python
from django.core.exceptions import ValidationError


def validate_image_inputs_schema(value):
    """
    Validate image_inputs_schema field.

    Accepted formats:
    - None or [] — no image inputs
    - list of slots: [{"key": ..., "label": ..., "max": ...}, ...]
    - groups object: {"mode": "groups", "groups": [...], "no_images_params": {...}}
    """
    if value is None or value == []:
        return

    if isinstance(value, list):
        _validate_flat_slots(value)
        return

    if isinstance(value, dict):
        if value.get('mode') != 'groups':
            raise ValidationError(
                'Объект image_inputs_schema должен иметь "mode": "groups". '
                'Либо используйте список слотов.'
            )
        _validate_groups_format(value)
        return

    raise ValidationError(
        'image_inputs_schema должен быть списком слотов или объектом с "mode": "groups".'
    )


def _validate_flat_slots(slots, context_label=''):
    """Validate a flat list of slot dicts."""
    prefix = f'{context_label}: ' if context_label else ''
    seen_keys = set()

    for i, slot in enumerate(slots):
        if not isinstance(slot, dict):
            raise ValidationError(f'{prefix}Слот #{i + 1} должен быть объектом.')

        for required_field in ('key', 'label', 'max'):
            if required_field not in slot:
                raise ValidationError(
                    f'{prefix}Слот #{i + 1}: отсутствует обязательное поле "{required_field}".'
                )

        key = slot['key']
        if key in seen_keys:
            raise ValidationError(f'{prefix}Дублирующийся ключ слота: "{key}".')
        seen_keys.add(key)

        slot_min = slot.get('min', 0)
        slot_max = slot['max']
        if isinstance(slot_min, (int, float)) and isinstance(slot_max, (int, float)):
            if slot_min > slot_max:
                raise ValidationError(
                    f'{prefix}Слот "{key}": min ({slot_min}) > max ({slot_max}).'
                )

    return seen_keys


def _validate_groups_format(value):
    """Validate the groups format."""
    groups = value.get('groups')
    if not isinstance(groups, list) or len(groups) == 0:
        raise ValidationError('"groups" должен быть непустым списком.')

    all_group_keys = set()
    all_slot_keys = set()

    # First pass: collect keys
    for i, group in enumerate(groups):
        if not isinstance(group, dict):
            raise ValidationError(f'Группа #{i + 1} должна быть объектом.')

        if 'key' not in group:
            raise ValidationError(f'Группа #{i + 1}: отсутствует обязательное поле "key".')

        group_key = group['key']
        if group_key in all_group_keys:
            raise ValidationError(f'Дублирующийся ключ группы: "{group_key}".')
        all_group_keys.add(group_key)

        slots = group.get('slots')
        if not isinstance(slots, list) or len(slots) == 0:
            raise ValidationError(
                f'Группа "{group_key}": "slots" должен быть непустым списком.'
            )

        group_slot_keys = _validate_flat_slots(
            slots,
            context_label=f'Группа "{group_key}"',
        )

        # Check for duplicate slot keys across groups
        overlap = group_slot_keys & all_slot_keys
        if overlap:
            raise ValidationError(
                f'Дублирующиеся ключи слотов между группами: {", ".join(sorted(overlap))}.'
            )
        all_slot_keys |= group_slot_keys

    # Second pass: validate cross-references
    for group in groups:
        group_key = group['key']

        # Validate exclusive_with
        exclusive_with = group.get('exclusive_with', [])
        if isinstance(exclusive_with, list):
            for ref in exclusive_with:
                if ref == group_key:
                    raise ValidationError(
                        f'Группа "{group_key}": exclusive_with не может ссылаться на себя.'
                    )
                if ref not in all_group_keys:
                    raise ValidationError(
                        f'Группа "{group_key}": exclusive_with ссылается на несуществующую группу "{ref}".'
                    )

        # Validate depends_on in slots
        group_slot_keys = {slot['key'] for slot in group['slots']}
        for slot in group['slots']:
            depends_on = slot.get('depends_on')
            if depends_on and depends_on not in group_slot_keys:
                raise ValidationError(
                    f'Группа "{group_key}", слот "{slot["key"]}": '
                    f'depends_on ссылается на несуществующий слот "{depends_on}".'
                )

        # Validate extra_params is dict if present
        extra_params = group.get('extra_params')
        if extra_params is not None and not isinstance(extra_params, dict):
            raise ValidationError(
                f'Группа "{group_key}": extra_params должен быть объектом.'
            )

    # Validate no_images_params
    no_images_params = value.get('no_images_params')
    if no_images_params is not None and not isinstance(no_images_params, dict):
        raise ValidationError('"no_images_params" должен быть объектом.')
```

### Step 1.3: Run tests, verify they pass

- [ ] Run tests

```bash
docker compose exec backend python manage.py test apps.ai_providers.tests.ImageInputsSchemaValidatorTest -v2
```

Expected: All tests PASS.

### Step 1.4: Commit

- [ ] Commit validator + tests

```bash
git add backend/apps/ai_providers/validators.py backend/apps/ai_providers/tests.py
git commit -m "feat: add validate_image_inputs_schema() with full test coverage"
```

---

## Task 2: Model help_text + form validation hookup

**Files:**
- Modify: `backend/apps/ai_providers/models.py:112-118`
- Modify: `backend/apps/ai_providers/admin_forms.py`
- Modify: `backend/apps/ai_providers/tests.py`

### Step 2.1: Update help_text on model field

- [ ] In `models.py`, update `image_inputs_schema` field's `help_text`:

```python
    image_inputs_schema = models.JSONField(
        default=list,
        blank=True,
        verbose_name='Схема входных изображений',
        help_text=(
            'Два формата:\n'
            '1) Список слотов: [{"key": "input_urls", "label": "...", "min": 0, "max": 4}]\n'
            '2) Группы: {"mode": "groups", "no_images_params": {...}, "groups": [{...}]}'
        ),
    )
```

### Step 2.2: Add hidden field and validation to admin form

- [ ] In `admin_forms.py`, add hidden field and wire up validation.

Add import at top of `admin_forms.py`:

```python
from django.core.exceptions import ValidationError as DjangoValidationError
```

Add field (after `pricing_bulk_json` on line 16):

```python
    image_inputs_payload = forms.CharField(required=False, widget=forms.HiddenInput())
```

In `clean()` method, after the `json_defaults` block (around line 173), add:

```python
        # Validate image_inputs_schema
        from .validators import validate_image_inputs_schema
        # If visual editor payload exists, parse it and override the schema
        raw_ii_payload = cleaned_data.get('image_inputs_payload', '')
        if raw_ii_payload and raw_ii_payload.strip():
            try:
                parsed = json.loads(raw_ii_payload)
                cleaned_data['image_inputs_schema'] = parsed
                instance.image_inputs_schema = parsed
            except (json.JSONDecodeError, TypeError) as exc:
                self.add_error('image_inputs_schema', f'Ошибка JSON: {exc}')
                return cleaned_data

        try:
            validate_image_inputs_schema(cleaned_data.get('image_inputs_schema'))
        except DjangoValidationError as exc:
            self.add_error('image_inputs_schema', exc)
```

Note: `add_error()` accepts a `ValidationError` object directly — Django will extract messages correctly.

### Step 2.3: Write form validation test

- [ ] Add test to `tests.py`:

```python
class ImageInputsAdminFormValidationTest(TestCase):
    """Test that admin form validates image_inputs_schema on save."""

    @classmethod
    def setUpTestData(cls):
        cls.provider = AIProvider.objects.create(
            name='Test Provider', base_url='https://api.test.com', is_active=True
        )

    def _make_form_data(self, image_inputs_schema=None, **overrides):
        data = {
            'provider': self.provider.pk,
            'name': 'Test Model',
            'model_type': 'IMAGE',
            'api_endpoint': '/v1/generate',
            'request_schema': '{"prompt": "{{prompt}}"}',
            'parameters_schema': '[]',
            'image_inputs_schema': json.dumps(image_inputs_schema or []),
            'pricing_schema': '{"fixed_cost": "1.00"}',
            'tags': '[]',
            'is_active': True,
        }
        data.update(overrides)
        return data

    def test_valid_simple_format_saves(self):
        data = self._make_form_data([
            {"key": "input_urls", "label": "Images", "min": 0, "max": 4},
        ])
        form = AIModelAdminForm(data=data)
        self.assertTrue(form.is_valid(), form.errors)

    def test_valid_groups_format_saves(self):
        schema = {
            "mode": "groups",
            "no_images_params": {"generation_type": "TEXT_2_VIDEO"},
            "groups": [{
                "key": "frames",
                "collect_to": "image_urls",
                "extra_params": {"generation_type": "FIRST_AND_LAST_FRAMES_2_VIDEO"},
                "slots": [{"key": "start", "label": "Start", "min": 1, "max": 1}],
            }],
        }
        data = self._make_form_data(schema)
        form = AIModelAdminForm(data=data)
        self.assertTrue(form.is_valid(), form.errors)

    def test_invalid_schema_shows_form_error(self):
        data = self._make_form_data("not_valid_at_all")
        form = AIModelAdminForm(data=data)
        self.assertFalse(form.is_valid())
        self.assertIn('image_inputs_schema', form.errors)
```

### Step 2.4: Run tests

- [ ] Run tests

```bash
docker compose exec backend python manage.py test apps.ai_providers.tests.ImageInputsAdminFormValidationTest -v2
```

Expected: All PASS.

### Step 2.5: Commit

- [ ] Commit

```bash
git add backend/apps/ai_providers/models.py backend/apps/ai_providers/admin_forms.py backend/apps/ai_providers/tests.py
git commit -m "feat: wire image_inputs_schema validation into admin form"
```

---

## Task 3: Admin template — Step 5 section

**Files:**
- Modify: `backend/templates/admin/ai_providers/aimodel/change_form.html`
- Create: `backend/templates/admin/ai_providers/aimodel/includes/image_inputs_panel.html`

### Step 3.1: Add Step 5 section to change_form.html

- [ ] Insert new section **after** the Step 4 (Pricing) `</section>` and **before** the Compiled Preview section. In `change_form.html` after line 127:

```html
    <section class="workflow-panel">
      <div class="workflow-panel__head">
        <div class="wf-step-badge">5</div>
        <div>
          <h2>Входные изображения</h2>
          <p>Настройка режимов загрузки изображений для генерации.</p>
        </div>
      </div>
      {% include "admin/ai_providers/aimodel/includes/image_inputs_panel.html" %}
    </section>
```

Also add hidden input for the payload. In the hidden inputs block at top (after line 6), add:

```html
  <input type="hidden" name="image_inputs_payload" id="id_image_inputs_payload" value="">
```

### Step 3.2: Create image_inputs_panel.html

- [ ] Create `backend/templates/admin/ai_providers/aimodel/includes/image_inputs_panel.html`:

```html
{% load i18n %}

<div class="wf-image-inputs-editor" data-image-inputs-editor>
  <!-- Mode toggle: Visual / JSON -->
  <div class="wf-tab-bar" data-ii-tab-bar>
    <button type="button" class="wf-tab wf-tab--active" data-ii-tab="visual">Визуальный редактор</button>
    <button type="button" class="wf-tab" data-ii-tab="json">JSON</button>
  </div>

  <!-- Visual editor -->
  <div data-ii-panel="visual">
    <!-- Format selector -->
    <div class="wf-field" style="margin-bottom: 16px;">
      <label>Формат</label>
      <div class="wf-toggle-row">
        <label class="wf-radio-label">
          <input type="radio" name="_ii_format" value="simple" data-ii-format checked>
          Простой (список слотов)
        </label>
        <label class="wf-radio-label">
          <input type="radio" name="_ii_format" value="groups" data-ii-format>
          С режимами (группы)
        </label>
      </div>
    </div>

    <!-- no_images_params (groups only) -->
    <div data-ii-no-images-section style="display:none">
      <div class="wf-field">
        <label>Параметры без изображений <code>no_images_params</code></label>
        <textarea
          data-ii-no-images-params
          class="wf-textarea wf-textarea--mono"
          rows="3"
          placeholder='{"generationType": "TEXT_2_VIDEO", "image_urls": []}'
        ></textarea>
        <p class="wf-help">JSON-объект с параметрами для подстановки, когда пользователь не загрузил ни одного изображения.</p>
      </div>
    </div>

    <!-- Groups container -->
    <div data-ii-groups-container>
      <!-- Groups will be rendered by JS -->
    </div>

    <!-- Simple slots container -->
    <div data-ii-simple-container>
      <!-- Simple slots will be rendered by JS -->
    </div>

    <div class="wf-inline-actions" style="margin-top: 12px;">
      <button type="button" class="wf-btn wf-btn--secondary" data-ii-add-group style="display:none">
        + Добавить группу
      </button>
      <button type="button" class="wf-btn wf-btn--secondary" data-ii-add-simple-slot>
        + Добавить слот
      </button>
    </div>
  </div>

  <!-- JSON editor -->
  <div data-ii-panel="json" style="display:none">
    <div class="wf-field">
      <label>image_inputs_schema (JSON)</label>
      <textarea
        data-ii-json-editor
        class="wf-textarea wf-textarea--mono"
        rows="16"
        placeholder='[{"key": "input_urls", "label": "Выберите изображения", "min": 0, "max": 4}]'
      ></textarea>
      <p class="wf-help">Вставьте JSON напрямую. При переключении на визуальный редактор — JSON будет распарсен.</p>
    </div>
    <div data-ii-json-error class="wf-validation-error" style="display:none"></div>
    <div class="wf-inline-actions">
      <button type="button" class="wf-btn wf-btn--secondary" data-ii-apply-json>
        Применить JSON
      </button>
    </div>
  </div>
</div>

<!-- Group template (cloned by JS) -->
<template data-ii-group-template>
  <div class="wf-ii-group" data-ii-group>
    <div class="wf-ii-group__header">
      <div class="wf-ii-group__title">
        <span class="wf-ii-group__badge">▪</span>
        <span data-ii-group-title>Группа</span>
        <button type="button" class="wf-btn-icon wf-btn-icon--danger" data-ii-remove-group title="Удалить группу">✕</button>
      </div>
      <details class="wf-ii-group__settings" open>
        <summary>Настройки группы</summary>
        <div class="wf-grid wf-grid--2">
          <div class="wf-field">
            <label>Key</label>
            <input type="text" data-ii-group-key class="wf-input" placeholder="frames">
          </div>
          <div class="wf-field">
            <label>Label (название в UI)</label>
            <input type="text" data-ii-group-label class="wf-input" placeholder="Кадры">
          </div>
          <div class="wf-field">
            <label>collect_to (ключ в generation_config)</label>
            <input type="text" data-ii-group-collect-to class="wf-input" placeholder="image_urls">
            <p class="wf-help">Все картинки из слотов этой группы попадут в этот ключ. Пусто = каждый слот → свой ключ.</p>
          </div>
          <div class="wf-field">
            <label>Исключает группы</label>
            <div data-ii-group-exclusive class="wf-dimension-chips">
              <!-- Checkboxes generated by JS -->
            </div>
          </div>
        </div>
        <div class="wf-field">
          <label>extra_params (JSON)</label>
          <textarea data-ii-group-extra-params class="wf-textarea wf-textarea--mono" rows="2" placeholder='{"generationType": "FIRST_AND_LAST_FRAMES_2_VIDEO"}'></textarea>
          <p class="wf-help">Эти параметры будут добавлены в generation_config, когда пользователь использует этот режим.</p>
        </div>
      </details>
    </div>
    <div class="wf-ii-group__slots" data-ii-slots-container>
      <!-- Slots rendered here -->
    </div>
    <button type="button" class="wf-btn wf-btn--secondary wf-btn--sm" data-ii-add-slot>
      + Добавить слот
    </button>
  </div>
</template>

<!-- Slot template (cloned by JS, works for both simple and group slots) -->
<template data-ii-slot-template>
  <div class="wf-ii-slot" data-ii-slot>
    <div class="wf-ii-slot__header">
      <span class="wf-ii-slot__badge">●</span>
      <span class="wf-ii-slot__indicator">●</span>
      <input type="text" data-ii-slot-key class="wf-input wf-input--sm" placeholder="start_frame" style="max-width:160px">
      <button type="button" class="wf-btn-icon wf-btn-icon--danger" data-ii-remove-slot title="Удалить слот">✕</button>
    </div>
    <div class="wf-grid wf-grid--2">
      <div class="wf-field">
        <label>Label (надпись в модалке)</label>
        <input type="text" data-ii-slot-label class="wf-input" placeholder="Начальный кадр">
      </div>
      <div class="wf-field">
        <label>Описание</label>
        <input type="text" data-ii-slot-description class="wf-input" placeholder="Выберите изображение для начала видео">
      </div>
      <div class="wf-field">
        <label>Иконка</label>
        <input type="text" data-ii-slot-icon class="wf-input" placeholder="play-circle">
      </div>
      <div class="wf-grid wf-grid--2" style="gap: 8px;">
        <div class="wf-field">
          <label>Min</label>
          <input type="number" data-ii-slot-min class="wf-input" value="0" min="0">
        </div>
        <div class="wf-field">
          <label>Max</label>
          <input type="number" data-ii-slot-max class="wf-input" value="1" min="1">
        </div>
      </div>
      <div class="wf-field" data-ii-depends-on-field>
        <label>Зависит от</label>
        <select data-ii-slot-depends-on class="wf-select">
          <option value="">— нет —</option>
        </select>
        <p class="wf-help">Слот станет доступен только когда выбранный слот заполнен.</p>
      </div>
    </div>
  </div>
</template>
```

### Step 3.3: Pass initial schema via workflow context + hide native field

The visual editor needs the initial value of `image_inputs_schema` on page load. Instead of relying on the native Django widget (which requires the field in a fieldset), we pass it through the workflow context — matching the pattern used by `mapping_payload_json`.

- [ ] In `admin.py`, in `get_workflow_context()`, add `image_inputs_schema_json` to the returned context:

```python
# In the `if obj is None:` branch, add:
'image_inputs_schema_json': '[]',

# In the `obj is not None` branch (after building context), add:
import json
context['image_inputs_schema_json'] = json.dumps(obj.image_inputs_schema or [])
```

- [ ] In `change_form.html`, keep `image_inputs_schema` in the Advanced section but add a note that it is managed by Step 5. Do NOT remove it from the fieldset — this ensures the native widget renders (needed for form submission). In the Advanced section, replace the `image_inputs_schema` block with:

```html
          <div class="wf-field" style="display:none">
            {{ adminform.form.image_inputs_schema }}
          </div>
```

- [ ] In the hidden inputs block (top of template), add a data attribute with the initial JSON:

```html
  <script type="application/json" id="image-inputs-initial">{{ workflow.image_inputs_schema_json }}</script>
```

### Step 3.4: Commit

- [ ] Commit templates

```bash
git add backend/templates/admin/ai_providers/aimodel/ backend/apps/ai_providers/admin.py
git commit -m "feat: add Step 5 image inputs panel template with group/slot templates"
```

---

## Task 4: JavaScript — Image Inputs Editor

**Files:**
- Create: `backend/static/admin/ai_providers/aimodel_image_inputs.js`
- Modify: `backend/apps/ai_providers/admin.py` (register JS)

### Step 4.1: Create the JavaScript file

- [ ] Create `backend/static/admin/ai_providers/aimodel_image_inputs.js`:

```javascript
/* Image Inputs Schema Editor — visual editor for image_inputs_schema.
   Renders groups/slots from existing schema, serializes back on form submit. */

document.addEventListener('DOMContentLoaded', () => {

  const editor = document.querySelector('[data-image-inputs-editor]');
  if (!editor) return;

  const payloadInput     = document.getElementById('id_image_inputs_payload');
  const nativeField      = document.getElementById('id_image_inputs_schema');
  const form             = editor.closest('form');
  const tabBar           = editor.querySelector('[data-ii-tab-bar]');
  const visualPanel      = editor.querySelector('[data-ii-panel="visual"]');
  const jsonPanel        = editor.querySelector('[data-ii-panel="json"]');
  const jsonEditor       = editor.querySelector('[data-ii-json-editor]');
  const jsonError        = editor.querySelector('[data-ii-json-error]');
  const applyJsonBtn     = editor.querySelector('[data-ii-apply-json]');
  const formatRadios     = editor.querySelectorAll('[data-ii-format]');
  const groupsContainer  = editor.querySelector('[data-ii-groups-container]');
  const simpleContainer  = editor.querySelector('[data-ii-simple-container]');
  const addGroupBtn      = editor.querySelector('[data-ii-add-group]');
  const addSimpleSlotBtn = editor.querySelector('[data-ii-add-simple-slot]');
  const noImagesSection  = editor.querySelector('[data-ii-no-images-section]');
  const noImagesTA       = editor.querySelector('[data-ii-no-images-params]');
  const groupTemplate    = document.querySelector('[data-ii-group-template]');
  const slotTemplate     = document.querySelector('[data-ii-slot-template]');

  let currentFormat = 'simple'; // 'simple' or 'groups'

  // ─── Utils ────────────────────────────────────────────────────────────────

  function safeParseJSON(str, fallback) {
    if (!str || !str.trim()) return fallback;
    try { return JSON.parse(str); } catch (_) { return fallback; }
  }

  // ─── Tab switching ────────────────────────────────────────────────────────

  tabBar.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-ii-tab]');
    if (!tab) return;
    const target = tab.dataset.iiTab;

    tabBar.querySelectorAll('.wf-tab').forEach(t => t.classList.remove('wf-tab--active'));
    tab.classList.add('wf-tab--active');

    if (target === 'json') {
      visualPanel.style.display = 'none';
      jsonPanel.style.display = '';
      jsonEditor.value = JSON.stringify(buildSchema(), null, 2);
    } else {
      jsonPanel.style.display = 'none';
      visualPanel.style.display = '';
    }
  });

  // ─── Apply JSON ───────────────────────────────────────────────────────────

  applyJsonBtn.addEventListener('click', () => {
    jsonError.style.display = 'none';
    let parsed;
    try {
      parsed = JSON.parse(jsonEditor.value);
    } catch (err) {
      jsonError.textContent = `Ошибка JSON: ${err.message}`;
      jsonError.style.display = '';
      return;
    }
    loadSchema(parsed);
    // Switch to visual
    tabBar.querySelector('[data-ii-tab="visual"]').click();
  });

  // ─── Format radio ─────────────────────────────────────────────────────────

  formatRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      currentFormat = radio.value;
      syncFormatVisibility();
    });
  });

  function syncFormatVisibility() {
    const isGroups = currentFormat === 'groups';
    groupsContainer.style.display  = isGroups ? '' : 'none';
    simpleContainer.style.display  = isGroups ? 'none' : '';
    addGroupBtn.style.display      = isGroups ? '' : 'none';
    addSimpleSlotBtn.style.display = isGroups ? 'none' : '';
    noImagesSection.style.display  = isGroups ? '' : 'none';
  }

  // ─── Create slot element ──────────────────────────────────────────────────

  function createSlotEl(slot = {}) {
    const el = slotTemplate.content.cloneNode(true).firstElementChild;
    el.querySelector('[data-ii-slot-key]').value         = slot.key || '';
    el.querySelector('[data-ii-slot-label]').value       = slot.label || '';
    el.querySelector('[data-ii-slot-description]').value = slot.description || '';
    el.querySelector('[data-ii-slot-icon]').value        = slot.icon || '';
    el.querySelector('[data-ii-slot-min]').value         = slot.min ?? 0;
    el.querySelector('[data-ii-slot-max]').value         = slot.max ?? 1;
    el.querySelector('[data-ii-slot-depends-on]').value  = slot.depends_on || '';

    el.querySelector('[data-ii-remove-slot]').addEventListener('click', () => {
      el.remove();
      refreshAllDependsOnDropdowns();
    });

    // Listen for key changes to update depends_on dropdowns
    el.querySelector('[data-ii-slot-key]').addEventListener('input', () => {
      refreshAllDependsOnDropdowns();
    });

    return el;
  }

  // ─── Create group element ─────────────────────────────────────────────────

  function createGroupEl(group = {}) {
    const el = groupTemplate.content.cloneNode(true).firstElementChild;
    el.querySelector('[data-ii-group-key]').value         = group.key || '';
    el.querySelector('[data-ii-group-label]').value       = group.label || '';
    el.querySelector('[data-ii-group-collect-to]').value  = group.collect_to || '';
    el.querySelector('[data-ii-group-extra-params]').value =
      group.extra_params ? JSON.stringify(group.extra_params) : '';

    const titleSpan = el.querySelector('[data-ii-group-title]');
    const keyInput  = el.querySelector('[data-ii-group-key]');
    const lblInput  = el.querySelector('[data-ii-group-label]');

    function updateTitle() {
      const lbl = lblInput.value.trim();
      const key = keyInput.value.trim();
      titleSpan.textContent = lbl || key || 'Новая группа';
    }
    keyInput.addEventListener('input', () => { updateTitle(); refreshAllExclusiveCheckboxes(); });
    lblInput.addEventListener('input', updateTitle);
    updateTitle();

    // Remove group
    el.querySelector('[data-ii-remove-group]').addEventListener('click', () => {
      el.remove();
      refreshAllExclusiveCheckboxes();
    });

    // Add slot button
    el.querySelector('[data-ii-add-slot]').addEventListener('click', () => {
      el.querySelector('[data-ii-slots-container]').appendChild(createSlotEl());
      refreshAllDependsOnDropdowns();
    });

    // Add existing slots
    const slotsContainer = el.querySelector('[data-ii-slots-container]');
    (group.slots || []).forEach(slot => {
      slotsContainer.appendChild(createSlotEl(slot));
    });

    // Store exclusive_with for later checkbox init
    el._exclusiveWith = group.exclusive_with || [];

    return el;
  }

  // ─── Refresh exclusive_with checkboxes across all groups ──────────────────

  function refreshAllExclusiveCheckboxes() {
    const groupEls = Array.from(groupsContainer.querySelectorAll('[data-ii-group]'));
    const allKeys = groupEls.map(g => g.querySelector('[data-ii-group-key]').value.trim()).filter(Boolean);

    groupEls.forEach(groupEl => {
      const myKey = groupEl.querySelector('[data-ii-group-key]').value.trim();
      const container = groupEl.querySelector('[data-ii-group-exclusive]');
      const otherKeys = allKeys.filter(k => k !== myKey);

      // Preserve current checked state
      const currentChecked = new Set();
      container.querySelectorAll('input:checked').forEach(cb => currentChecked.add(cb.value));

      container.innerHTML = '';
      if (otherKeys.length === 0) {
        container.innerHTML = '<span class="wf-muted-note">Добавьте ещё группу</span>';
        return;
      }

      otherKeys.forEach(key => {
        const label = document.createElement('label');
        label.className = 'wf-dimension-chip';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = key;
        cb.checked = currentChecked.has(key) || (groupEl._exclusiveWith || []).includes(key);

        const span = document.createElement('span');
        span.className = 'wf-dimension-chip__label';
        span.textContent = key;

        label.appendChild(cb);
        label.appendChild(span);
        container.appendChild(label);
      });

      // Clear the initial exclusive_with after first render
      delete groupEl._exclusiveWith;
    });
  }

  // ─── Refresh depends_on dropdowns within each group ───────────────────────

  function refreshAllDependsOnDropdowns() {
    const groupEls = groupsContainer.querySelectorAll('[data-ii-group]');
    groupEls.forEach(refreshDependsOnInGroup);

    // Also for simple slots
    refreshDependsOnInContainer(simpleContainer);
  }

  function refreshDependsOnInGroup(groupEl) {
    refreshDependsOnInContainer(groupEl.querySelector('[data-ii-slots-container]'));
  }

  function refreshDependsOnInContainer(container) {
    if (!container) return;
    const slotEls = Array.from(container.querySelectorAll('[data-ii-slot]'));
    const allKeys = slotEls.map(s => s.querySelector('[data-ii-slot-key]').value.trim()).filter(Boolean);

    slotEls.forEach(slotEl => {
      const myKey = slotEl.querySelector('[data-ii-slot-key]').value.trim();
      const select = slotEl.querySelector('[data-ii-slot-depends-on]');
      const currentVal = select.value;

      select.innerHTML = '<option value="">— нет —</option>';
      allKeys.forEach(key => {
        if (key === myKey) return;
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = key;
        if (key === currentVal) opt.selected = true;
        select.appendChild(opt);
      });
    });
  }

  // ─── Build schema from visual editor state ────────────────────────────────

  function readSlot(slotEl) {
    const slot = {
      key:   slotEl.querySelector('[data-ii-slot-key]').value.trim(),
      label: slotEl.querySelector('[data-ii-slot-label]').value.trim(),
      min:   parseInt(slotEl.querySelector('[data-ii-slot-min]').value, 10) || 0,
      max:   parseInt(slotEl.querySelector('[data-ii-slot-max]').value, 10) || 1,
    };
    const desc = slotEl.querySelector('[data-ii-slot-description]').value.trim();
    if (desc) slot.description = desc;
    const icon = slotEl.querySelector('[data-ii-slot-icon]').value.trim();
    if (icon) slot.icon = icon;
    const dep = slotEl.querySelector('[data-ii-slot-depends-on]').value;
    if (dep) slot.depends_on = dep;
    return slot;
  }

  function readGroup(groupEl) {
    const group = {
      key:   groupEl.querySelector('[data-ii-group-key]').value.trim(),
      label: groupEl.querySelector('[data-ii-group-label]').value.trim(),
    };
    const collectTo = groupEl.querySelector('[data-ii-group-collect-to]').value.trim();
    if (collectTo) group.collect_to = collectTo;

    const exclusiveChecked = Array.from(
      groupEl.querySelectorAll('[data-ii-group-exclusive] input:checked')
    ).map(cb => cb.value);
    if (exclusiveChecked.length) group.exclusive_with = exclusiveChecked;

    const extraRaw = groupEl.querySelector('[data-ii-group-extra-params]').value.trim();
    if (extraRaw) {
      try { group.extra_params = JSON.parse(extraRaw); } catch (_) {}
    }

    group.slots = Array.from(
      groupEl.querySelectorAll('[data-ii-slots-container] > [data-ii-slot]')
    ).map(readSlot);

    return group;
  }

  function buildSchema() {
    if (currentFormat === 'simple') {
      return Array.from(
        simpleContainer.querySelectorAll('[data-ii-slot]')
      ).map(readSlot);
    }

    const schema = { mode: 'groups' };

    const noImagesRaw = noImagesTA.value.trim();
    if (noImagesRaw) {
      try { schema.no_images_params = JSON.parse(noImagesRaw); } catch (_) {}
    }

    schema.groups = Array.from(
      groupsContainer.querySelectorAll(':scope > [data-ii-group]')
    ).map(readGroup);

    return schema;
  }

  // ─── Load schema into visual editor ───────────────────────────────────────

  function loadSchema(schema) {
    // Clear
    groupsContainer.innerHTML = '';
    simpleContainer.innerHTML = '';

    if (schema === null || schema === undefined) schema = [];

    if (Array.isArray(schema)) {
      // Simple format
      currentFormat = 'simple';
      formatRadios.forEach(r => { r.checked = r.value === 'simple'; });
      schema.forEach(slot => {
        simpleContainer.appendChild(createSlotEl(slot));
      });
    } else if (typeof schema === 'object' && schema.mode === 'groups') {
      // Groups format
      currentFormat = 'groups';
      formatRadios.forEach(r => { r.checked = r.value === 'groups'; });

      if (schema.no_images_params) {
        noImagesTA.value = JSON.stringify(schema.no_images_params, null, 2);
      }

      (schema.groups || []).forEach(group => {
        groupsContainer.appendChild(createGroupEl(group));
      });

      refreshAllExclusiveCheckboxes();
    }

    syncFormatVisibility();
    refreshAllDependsOnDropdowns();
  }

  // ─── Add group / slot buttons ─────────────────────────────────────────────

  addGroupBtn.addEventListener('click', () => {
    groupsContainer.appendChild(createGroupEl());
    refreshAllExclusiveCheckboxes();
    refreshAllDependsOnDropdowns();
  });

  addSimpleSlotBtn.addEventListener('click', () => {
    simpleContainer.appendChild(createSlotEl());
    refreshAllDependsOnDropdowns();
  });

  // ─── Form submit — serialize to hidden input ──────────────────────────────

  if (form) {
    form.addEventListener('submit', () => {
      const schema = buildSchema();
      if (payloadInput) {
        payloadInput.value = JSON.stringify(schema);
      }
      // Also update the native field so Django saves it
      if (nativeField) {
        nativeField.value = JSON.stringify(schema);
      }
    }, true);
  }

  // ─── Initial load from workflow context ─────────────────────────────────────

  const initialScript = document.getElementById('image-inputs-initial');
  const initialValue = safeParseJSON(initialScript?.textContent, []);
  loadSchema(initialValue);
});
```

### Step 4.2: Register JS in admin.py

- [ ] In `admin.py`, add the new JS file to `class Media` (line 126):

```python
    class Media:
        css = {
            'all': ('admin/ai_providers/aimodel_workflow.css',),
        }
        js = (
            'admin/ai_providers/aimodel_workflow.js',
            'admin/ai_providers/aimodel_image_inputs.js',
        )
```

### Step 4.3: Commit

- [ ] Commit JS + admin registration

```bash
git add backend/static/admin/ai_providers/aimodel_image_inputs.js backend/apps/ai_providers/admin.py
git commit -m "feat: add image inputs visual editor JS"
```

---

## Task 5: CSS Styles for Image Inputs Editor

**Files:**
- Modify: `backend/static/admin/ai_providers/aimodel_workflow.css`

### Step 5.1: Add CSS for image inputs components

- [ ] Append to the end of `aimodel_workflow.css`:

```css
/* ═══════════════════════════════════════════════════════════
   Image Inputs Editor (Step 5)
   ═══════════════════════════════════════════════════════════ */

/* Tab bar */
.wf-tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 2px solid var(--wf-border);
  margin-bottom: 20px;
}
.wf-tab {
  padding: 8px 20px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  color: var(--wf-text-muted);
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: color 0.15s, border-color 0.15s;
}
.wf-tab:hover { color: var(--wf-text); }
.wf-tab--active {
  color: var(--wf-accent);
  border-bottom-color: var(--wf-accent);
  font-weight: 600;
}

/* Format toggle row */
.wf-toggle-row {
  display: flex;
  gap: 24px;
  align-items: center;
}
.wf-radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
}

/* Group card */
.wf-ii-group {
  border: 1px solid var(--wf-border);
  border-radius: var(--wf-radius);
  padding: 16px;
  margin-bottom: 16px;
  background: var(--wf-surface);
}
.wf-ii-group__header {
  margin-bottom: 12px;
}
.wf-ii-group__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}
.wf-ii-group__badge {
  color: var(--wf-accent);
  font-size: 14px;
}
.wf-ii-group__settings summary {
  cursor: pointer;
  font-size: 13px;
  color: var(--wf-text-muted);
  margin-bottom: 12px;
}
.wf-ii-group__slots {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

/* Slot card */
.wf-ii-slot {
  border: 1px solid var(--wf-border-light, #e5e7eb);
  border-radius: calc(var(--wf-radius) - 2px);
  padding: 12px;
  background: #fff;
}
.wf-ii-slot__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.wf-ii-slot__badge {
  color: var(--wf-accent);
  font-size: 10px;
}
.wf-ii-slot__indicator {
  font-size: 10px;
  color: var(--wf-accent);
}

/* Small button */
.wf-btn--sm {
  font-size: 12px;
  padding: 4px 12px;
}

/* Icon button (danger) */
.wf-btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 6px;
  border-radius: 4px;
  line-height: 1;
  transition: background 0.15s;
}
.wf-btn-icon:hover {
  background: rgba(0,0,0,0.05);
}
.wf-btn-icon--danger {
  color: #dc3545;
}
.wf-btn-icon--danger:hover {
  background: rgba(220,53,69,0.1);
}

/* Validation error */
.wf-validation-error {
  color: #dc3545;
  font-size: 13px;
  padding: 8px 12px;
  background: #fdf0f0;
  border-radius: 4px;
  margin: 8px 0;
}

/* Small input variant */
.wf-input--sm {
  padding: 4px 8px;
  font-size: 13px;
}
```

### Step 5.2: Commit

- [ ] Commit CSS

```bash
git add backend/static/admin/ai_providers/aimodel_workflow.css
git commit -m "feat: add CSS styles for image inputs editor"
```

---

## Task 6: Wire it all together — form save logic

**Files:**
- Modify: `backend/apps/ai_providers/admin_forms.py`

### Step 6.1: Handle image_inputs_payload in clean()

This was partially done in Task 2. Verify the flow:

1. On form submit, JS serializes the visual editor state into `id_image_inputs_payload` (hidden input).
2. `clean()` checks if `image_inputs_payload` is non-empty → parses it → overwrites `image_inputs_schema`.
3. Validator runs on the result.
4. On `save()`, Django saves `image_inputs_schema` to the model as-is.

- [ ] Verify the `image_inputs_payload` field is declared (from Task 2) and test end-to-end by:

```bash
docker compose exec backend python manage.py test apps.ai_providers.tests.ImageInputsAdminFormValidationTest -v2
```

### Step 6.2: Add integration test — round-trip save

- [ ] Add test to `tests.py`:

```python
class ImageInputsRoundTripTest(TestCase):
    """Test that image_inputs_schema saves and loads correctly through admin form."""

    @classmethod
    def setUpTestData(cls):
        cls.provider = AIProvider.objects.create(
            name='Test', base_url='https://api.test.com', is_active=True
        )

    def _form_data(self, schema):
        return {
            'provider': self.provider.pk,
            'name': 'VEO Test',
            'model_type': 'VIDEO',
            'api_endpoint': '/v1/veo/generate',
            'request_schema': json.dumps({
                "prompt": "{{prompt}}",
                "imageUrls": "{{image_urls}}",
                "generationType": "{{generation_type}}",
            }),
            'parameters_schema': '[]',
            'image_inputs_schema': json.dumps(schema),
            'pricing_schema': '{"fixed_cost": "5.00"}',
            'tags': '[]',
            'is_active': True,
            'mapping_payload': json.dumps([
                {"placeholder": "generation_type", "role": "hidden", "parameter_code": "generation_type"},
                {"placeholder": "image_urls", "role": "auto_input", "parameter_code": "image_urls"},
            ]),
        }

    def test_groups_schema_round_trip(self):
        schema = {
            "mode": "groups",
            "no_images_params": {"generation_type": "TEXT_2_VIDEO", "image_urls": []},
            "groups": [{
                "key": "frames",
                "label": "Кадры",
                "collect_to": "image_urls",
                "extra_params": {"generation_type": "FIRST_AND_LAST_FRAMES_2_VIDEO"},
                "slots": [
                    {"key": "start_frame", "label": "Начальный кадр", "min": 1, "max": 1},
                    {"key": "end_frame", "label": "Конечный кадр", "min": 0, "max": 1, "depends_on": "start_frame"},
                ],
            }],
        }
        data = self._form_data(schema)
        form = AIModelAdminForm(data=data)
        self.assertTrue(form.is_valid(), form.errors)
        instance = form.save()
        instance.refresh_from_db()
        self.assertEqual(instance.image_inputs_schema['mode'], 'groups')
        self.assertEqual(len(instance.image_inputs_schema['groups']), 1)
        self.assertEqual(len(instance.image_inputs_schema['groups'][0]['slots']), 2)

    def test_simple_schema_round_trip(self):
        schema = [{"key": "input_urls", "label": "Images", "min": 0, "max": 4}]
        data = self._form_data(schema)
        form = AIModelAdminForm(data=data)
        self.assertTrue(form.is_valid(), form.errors)
        instance = form.save()
        instance.refresh_from_db()
        self.assertEqual(len(instance.image_inputs_schema), 1)
        self.assertEqual(instance.image_inputs_schema[0]['key'], 'input_urls')
```

### Step 6.3: Run all tests

- [ ] Run full test suite for ai_providers:

```bash
docker compose exec backend python manage.py test apps.ai_providers -v2
```

Expected: All PASS, no regressions.

### Step 6.4: Commit

- [ ] Commit

```bash
git add backend/apps/ai_providers/admin_forms.py backend/apps/ai_providers/tests.py
git commit -m "feat: image inputs schema save round-trip with integration tests"
```

---

## Task 7: Serializer verification

**Files:**
- Verify: `backend/apps/ai_providers/serializers.py` (no changes expected)

### Step 7.1: Verify serializer passes through as-is

- [ ] Check that `AIModelSerializer` returns `image_inputs_schema` without transformation.

Looking at `serializers.py:28-41`: the field is in `fields` and `read_only_fields`, and there's no `SerializerMethodField` for it (unlike `parameters_schema`). This means it returns the raw JSON value from the database — exactly what we want.

No changes needed. Both formats (list and groups object) will be returned as-is.

### Step 7.2: Add serializer test

- [ ] Add test:

```python
class ImageInputsSerializerTest(TestCase):
    """Verify serializer returns image_inputs_schema as-is."""

    @classmethod
    def setUpTestData(cls):
        cls.provider = AIProvider.objects.create(
            name='Test', base_url='https://api.test.com', is_active=True
        )

    def test_groups_format_serialized_as_is(self):
        schema = {
            "mode": "groups",
            "no_images_params": {"generation_type": "TEXT_2_VIDEO"},
            "groups": [{"key": "g1", "slots": [{"key": "s1", "label": "S1", "max": 1}]}],
        }
        model = AIModel.objects.create(
            provider=self.provider, name='Test', model_type='VIDEO',
            api_endpoint='/test', image_inputs_schema=schema,
            pricing_schema={"fixed_cost": "1.00"},
        )
        from .serializers import AIModelSerializer
        data = AIModelSerializer(model).data
        self.assertEqual(data['image_inputs_schema']['mode'], 'groups')
        self.assertEqual(len(data['image_inputs_schema']['groups']), 1)

    def test_simple_format_serialized_as_is(self):
        schema = [{"key": "input_urls", "label": "Images", "min": 0, "max": 4}]
        model = AIModel.objects.create(
            provider=self.provider, name='Test2', model_type='IMAGE',
            api_endpoint='/test', image_inputs_schema=schema,
            pricing_schema={"fixed_cost": "1.00"},
        )
        from .serializers import AIModelSerializer
        data = AIModelSerializer(model).data
        self.assertIsInstance(data['image_inputs_schema'], list)
        self.assertEqual(data['image_inputs_schema'][0]['key'], 'input_urls')
```

### Step 7.3: Run and commit

- [ ] Run tests:

```bash
docker compose exec backend python manage.py test apps.ai_providers.tests.ImageInputsSerializerTest -v2
```

- [ ] Commit:

```bash
git add backend/apps/ai_providers/tests.py
git commit -m "test: verify serializer passes image_inputs_schema through as-is"
```

---

## Task 8: Manual QA in admin

### Step 8.1: Verify visual editor loads

- [ ] Open admin, create or edit an AIModel. Verify:
  - Step 5 "Входные изображения" appears after Step 4 "Цена"
  - Simple format: can add/remove slots, key/label/min/max fields work
  - Groups format: can add groups, add slots inside groups, set depends_on, exclusive_with
  - JSON tab shows current state, "Применить JSON" loads it back
  - Form saves and reloads with correct data

### Step 8.2: Test with VEO-style schema

- [ ] Paste this JSON in the JSON editor and apply:

```json
{
  "mode": "groups",
  "no_images_params": {"generation_type": "TEXT_2_VIDEO", "image_urls": []},
  "groups": [
    {
      "key": "frames",
      "label": "Кадры",
      "collect_to": "image_urls",
      "exclusive_with": ["references"],
      "extra_params": {"generation_type": "FIRST_AND_LAST_FRAMES_2_VIDEO"},
      "slots": [
        {"key": "start_frame", "label": "Начальный кадр", "description": "Выберите изображение для начала видео", "icon": "play-circle", "min": 1, "max": 1},
        {"key": "end_frame", "label": "Конечный кадр", "description": "Выберите изображение для конца видео", "icon": "skip-forward", "min": 0, "max": 1, "depends_on": "start_frame"}
      ]
    },
    {
      "key": "references",
      "label": "Референсы",
      "collect_to": "image_urls",
      "exclusive_with": ["frames"],
      "extra_params": {"generation_type": "REFERENCE_2_VIDEO"},
      "slots": [
        {"key": "ref_images", "label": "Визуальный стиль и композиция", "description": "Выберите до 3 референсных изображений", "icon": "images", "min": 1, "max": 3}
      ]
    }
  ]
}
```

- [ ] Verify visual editor shows two groups with correct data
- [ ] Save, reload — data persists
- [ ] Switch to JSON tab — JSON matches

### Step 8.3: Final commit

- [ ] Final commit if needed (add specific changed files):

```bash
git add backend/apps/ai_providers/ backend/templates/admin/ai_providers/ backend/static/admin/ai_providers/
git commit -m "feat: complete image inputs schema editor (Step 5) with visual editor, JSON toggle, and validation"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Validator with tests | validators.py, tests.py |
| 2 | Model help_text + form validation | models.py, admin_forms.py, tests.py |
| 3 | Admin template (Step 5 + panel) | change_form.html, image_inputs_panel.html, admin.py |
| 4 | JavaScript editor | aimodel_image_inputs.js, admin.py |
| 5 | CSS styles | aimodel_workflow.css |
| 6 | Form save logic + integration tests | admin_forms.py, tests.py |
| 7 | Serializer verification | tests.py |
| 8 | Manual QA | (manual) |

**Total estimated commits:** 7
**Backend-only:** Yes. No frontend changes.
**Migrations:** None. Only `help_text` change (no migration needed for that).
