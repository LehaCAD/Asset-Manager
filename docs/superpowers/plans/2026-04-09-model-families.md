# Model Families Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group AI model variants into families — one card in picker, variant switcher in ConfigPanel.

**Architecture:** New `ModelFamily` model with nullable FK on `AIModel`. Each variant is a full independent AIModel. Frontend groups by family in picker, shows pills/select switcher. Admin chooses UI control type per family.

**Tech Stack:** Django 5 + DRF (backend), Next.js 14 + Zustand 5 + Tailwind 4 (frontend), Docker dev environment.

**Spec:** `docs/superpowers/specs/2026-04-09-model-families-design.md`

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `backend/apps/ai_providers/migrations/NNNN_modelfamily.py` | ModelFamily table |
| Create | `backend/apps/ai_providers/migrations/NNNN_aimodel_family_fields.py` | family FK + variant fields on AIModel |
| Create | `frontend/components/generation/VariantSwitcher.tsx` | Pills/select variant switcher component |
| Modify | `backend/apps/ai_providers/models.py` | Add ModelFamily model, AIModel fields + clean() |
| Modify | `backend/apps/ai_providers/serializers.py` | ModelFamilyBriefSerializer, update AIModelSerializer |
| Modify | `backend/apps/ai_providers/views.py` | Exclude inactive families from queryset |
| Modify | `backend/apps/ai_providers/admin.py` | ModelFamilyAdmin, update AIModelAdmin (Step 0, changelist, clone action) |
| Modify | `backend/apps/ai_providers/admin_forms.py` | Variant field validation in clean() |
| Modify | `backend/templates/admin/ai_providers/aimodel/change_form.html` | Step 0 section, step badge renumbering |
| Modify | `backend/static/admin/ai_providers/aimodel_workflow.js` | Family field toggle JS |
| Modify | `frontend/lib/types/index.ts` | ModelFamilyBrief interface, AIModel fields |
| Modify | `frontend/lib/store/generation.ts` | familyVariants() function |
| Modify | `frontend/components/generation/ConfigPanel.tsx` | Render VariantSwitcher |
| Modify | `frontend/components/generation/ModelSelector.tsx` | Family grouping logic |

---

## Task 1: Backend — ModelFamily model + AIModel fields

**Files:**
- Modify: `backend/apps/ai_providers/models.py`

- [ ] **Step 1: Extract model type constants to module level**

Currently `MODEL_TYPE_IMAGE`, `MODEL_TYPE_VIDEO`, `MODEL_TYPE_CHOICES` are class attributes on `AIModel`. Since `ModelFamily` is defined BEFORE `AIModel` and also needs these choices, extract them to module level (before any class definition):

```python
# Module-level constants (before any model class)
MODEL_TYPE_IMAGE = 'IMAGE'
MODEL_TYPE_VIDEO = 'VIDEO'
MODEL_TYPE_CHOICES = [
    (MODEL_TYPE_IMAGE, 'Изображение'),
    (MODEL_TYPE_VIDEO, 'Видео'),
]
```

Update `AIModel` to use `MODEL_TYPE_CHOICES` (module-level) instead of `AIModel.MODEL_TYPE_CHOICES`. Keep `AIModel.MODEL_TYPE_IMAGE` and `AIModel.MODEL_TYPE_VIDEO` as aliases pointing to the module constants for backward compatibility.

- [ ] **Step 2: Add ModelFamily model**

Insert before `class AIModel`:

```python
class ModelFamily(models.Model):
    """Семейство вариантов AI-модели (например, Veo 3.1 Fast/Quality)."""

    VARIANT_UI_PILLS = 'pills'
    VARIANT_UI_SELECT = 'select'
    VARIANT_UI_CHOICES = [
        (VARIANT_UI_PILLS, 'Кнопки (pills)'),
        (VARIANT_UI_SELECT, 'Выпадающий список (select)'),
    ]

    name = models.CharField(
        max_length=100,
        verbose_name='Название семейства',
        help_text='Например: Veo 3.1, Flux 2, Kling'
    )
    model_type = models.CharField(
        max_length=10,
        choices=MODEL_TYPE_CHOICES,
        verbose_name='Тип модели'
    )
    preview_url = models.CharField(
        max_length=500,
        blank=True,
        verbose_name='URL превью',
        help_text='Превью-картинка для карточки семейства в пикере'
    )
    description = models.TextField(
        blank=True,
        verbose_name='Описание',
        help_text='Описание семейства для пикера'
    )
    tags = models.JSONField(
        default=list,
        blank=True,
        verbose_name='Теги',
        help_text='Бейджи для карточки семейства'
    )
    variant_ui_control = models.CharField(
        max_length=20,
        choices=VARIANT_UI_CHOICES,
        default=VARIANT_UI_PILLS,
        verbose_name='Тип переключателя вариантов',
        help_text='Как пользователь переключает варианты: кнопки или выпадающий список'
    )
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name='Порядок сортировки'
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name='Активно',
        help_text='Если выключено — все варианты семейства скрыты'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Дата обновления')

    class Meta:
        verbose_name = 'Семейство моделей'
        verbose_name_plural = 'Семейства моделей'
        ordering = ['sort_order', 'name']

    def __str__(self) -> str:
        status = '✓' if self.is_active else '✗'
        return f'{status} {self.name} ({self.get_model_type_display()})'
```

- [ ] **Step 3: Add family fields to AIModel**

Add after `tags` field (around line 131 in original, adjusted for ModelFamily insertion):

```python
family = models.ForeignKey(
    ModelFamily,
    on_delete=models.SET_NULL,
    null=True,
    blank=True,
    related_name='variants',
    verbose_name='Семейство',
    help_text='Принадлежность к семейству. Пусто = standalone модель.'
)
variant_label = models.CharField(
    max_length=100,
    blank=True,
    verbose_name='Название варианта',
    help_text='Короткое название: Fast, Quality, Pro, v2'
)
variant_sort_order = models.PositiveIntegerField(
    default=0,
    verbose_name='Порядок варианта',
    help_text='Порядок в переключателе вариантов'
)
is_default_variant = models.BooleanField(
    default=False,
    verbose_name='Вариант по умолчанию',
    help_text='Какой вариант выбирается при клике на семейство в пикере'
)
```

- [ ] **Step 4: Add clean() to AIModel**

Add after `get_runtime_pricing_schema()` method:

```python
def clean(self):
    from django.core.exceptions import ValidationError

    if self.family:
        if self.family.model_type != self.model_type:
            raise ValidationError({
                'family': f'Тип модели ({self.get_model_type_display()}) не совпадает '
                          f'с типом семейства ({self.family.get_model_type_display()}).'
            })
        if not self.variant_label:
            raise ValidationError({
                'variant_label': 'Название варианта обязательно для модели в семействе.'
            })
        # Enforce exactly one default variant per family
        if self.is_default_variant:
            existing = type(self).objects.filter(
                family=self.family, is_default_variant=True
            ).exclude(pk=self.pk)
            if existing.exists():
                raise ValidationError({
                    'is_default_variant': f'В семействе уже есть вариант по умолчанию: {existing.first().name}'
                })
    else:
        if self.variant_label:
            raise ValidationError({
                'variant_label': 'Название варианта должно быть пусто для standalone модели.'
            })
```

- [ ] **Step 5: Create migrations**

```bash
docker compose exec backend python manage.py makemigrations ai_providers
```

- [ ] **Step 6: Run migrations**

```bash
docker compose exec backend python manage.py migrate
```

- [ ] **Step 7: Verify in shell**

```bash
docker compose exec backend python manage.py shell -c "
from apps.ai_providers.models import ModelFamily, AIModel
print('ModelFamily fields:', [f.name for f in ModelFamily._meta.get_fields()])
print('AIModel has family:', hasattr(AIModel, 'family'))
print('Existing models:', AIModel.objects.count())
print('All have family=None:', AIModel.objects.filter(family__isnull=True).count())
"
```

- [ ] **Step 8: Commit**

```bash
git add backend/apps/ai_providers/models.py backend/apps/ai_providers/migrations/
git commit -m "feat(ai_providers): add ModelFamily model and family fields on AIModel"
```

---

## Task 2: Backend — Serializers + API filtering

**Files:**
- Modify: `backend/apps/ai_providers/serializers.py`
- Modify: `backend/apps/ai_providers/views.py`

- [ ] **Step 1: Add ModelFamilyBriefSerializer**

In `serializers.py`, add import and new serializer:

```python
from .models import AIProvider, AIModel, ModelFamily

class ModelFamilyBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = ModelFamily
        fields = ('id', 'name', 'preview_url', 'description', 'tags', 'variant_ui_control')
        read_only_fields = fields
```

- [ ] **Step 2: Update AIModelSerializer (ADD fields, do NOT replace the class)**

Add `family` field declaration alongside existing `provider_name` and `parameters_schema`:

```python
family = ModelFamilyBriefSerializer(read_only=True)
```

Then add 4 new fields to the existing `Meta.fields` tuple:

```python
'family', 'variant_label', 'is_default_variant', 'variant_sort_order',
```

Keep all existing fields and methods (`get_parameters_schema`, etc.) intact. Only add — do not replace.

- [ ] **Step 3: Update queryset in views.py**

In `AIModelViewSet.get_queryset()`, add `select_related('family')` and `.exclude(family__is_active=False)`:

```python
queryset = AIModel.objects.filter(
    is_active=True,
    provider__is_active=True,
).select_related('provider', 'family').exclude(
    family__is_active=False
)
```

- [ ] **Step 4: Verify API response**

```bash
docker compose exec backend python manage.py shell -c "
from apps.ai_providers.serializers import AIModelSerializer
from apps.ai_providers.models import AIModel
m = AIModel.objects.select_related('provider', 'family').first()
s = AIModelSerializer(m)
print(s.data.keys())
print('family:', s.data.get('family'))
print('variant_label:', s.data.get('variant_label'))
"
```

- [ ] **Step 5: Commit**

```bash
git add backend/apps/ai_providers/serializers.py backend/apps/ai_providers/views.py
git commit -m "feat(ai_providers): add family fields to API serializer and filter inactive families"
```

---

## Task 3: Backend — Django admin (ModelFamilyAdmin + AIModel Step 0)

**Files:**
- Modify: `backend/apps/ai_providers/admin.py`
- Modify: `backend/apps/ai_providers/admin_forms.py`
- Modify: `backend/templates/admin/ai_providers/aimodel/change_form.html`
- Modify: `backend/static/admin/ai_providers/aimodel_workflow.js`

- [ ] **Step 1: Register ModelFamilyAdmin**

In `admin.py`, add import and new admin class:

```python
from .models import AIProvider, AIModel, CanonicalParameter, ModelFamily

@admin.register(ModelFamily)
class ModelFamilyAdmin(admin.ModelAdmin):
    list_display = ('name', 'model_type', 'variant_count_display', 'variant_ui_control', 'sort_order', 'is_active')
    list_filter = ('model_type', 'is_active')
    list_editable = ('sort_order', 'is_active')
    search_fields = ('name',)
    readonly_fields = ('created_at', 'updated_at', 'variants_table')

    fieldsets = (
        ('Основная информация', {
            'fields': ('name', 'model_type', 'preview_url', 'description', 'tags', 'variant_ui_control', 'sort_order', 'is_active'),
        }),
        ('Метаданные', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
        ('Варианты', {
            'fields': ('variants_table',),
        }),
    )

    def variant_count_display(self, obj):
        return obj.variants.count()
    variant_count_display.short_description = 'Вариантов'

    def variants_table(self, obj):
        from django.utils.html import format_html
        if not obj.pk:
            return 'Сначала сохраните семейство.'
        variants = obj.variants.select_related('provider').order_by('variant_sort_order', 'id')
        if not variants.exists():
            return 'Нет вариантов.'
        rows = []
        for v in variants:
            default_mark = '⭐' if v.is_default_variant else ''
            active_mark = '✓' if v.is_active else '✗'
            url = f'/admin/ai_providers/aimodel/{v.pk}/change/'
            rows.append(
                f'<tr><td><a href="{url}">{v.name}</a></td>'
                f'<td>{v.variant_label}</td>'
                f'<td style="text-align:center">{default_mark}</td>'
                f'<td style="text-align:center">{active_mark}</td></tr>'
            )
        return format_html(
            '<table style="width:100%;border-collapse:collapse">'
            '<thead><tr><th style="text-align:left;padding:4px 8px">Модель</th>'
            '<th style="text-align:left;padding:4px 8px">Вариант</th>'
            '<th style="text-align:center;padding:4px 8px">По умолч.</th>'
            '<th style="text-align:center;padding:4px 8px">Активна</th></tr></thead>'
            '<tbody>{}</tbody></table>',
            format_html(''.join(rows))
        )
    variants_table.short_description = 'Варианты в этом семействе'
```

- [ ] **Step 2: Update AIModelAdmin fieldsets — add Step 0**

In `AIModelAdmin`, add `family` fields to the FIRST fieldset position. Find the existing fieldsets tuple and prepend:

```python
('Семейство', {
    'fields': ('family', 'variant_label', 'variant_sort_order', 'is_default_variant'),
    'description': 'Привяжите модель к семейству для группировки вариантов.',
}),
```

- [ ] **Step 3: Update AIModelAdmin changelist**

Add family display columns and filter:

```python
list_display = (... existing ..., 'family_display', 'variant_label_display')
list_filter = (... existing ..., 'family')

def family_display(self, obj):
    if obj.family:
        return obj.family.name
    return '—'
family_display.short_description = 'Семейство'

def variant_label_display(self, obj):
    if not obj.variant_label:
        return '—'
    if obj.is_default_variant:
        return f'{obj.variant_label} ⭐'
    return obj.variant_label
variant_label_display.short_description = 'Вариант'
```

- [ ] **Step 4: Add variant validation to admin form**

In `admin_forms.py`, in `AIModelAdminForm.clean()`, add at the beginning:

```python
family = self.cleaned_data.get('family')
variant_label = self.cleaned_data.get('variant_label')
is_default = self.cleaned_data.get('is_default_variant')

if family and not variant_label:
    self.add_error('variant_label', 'Название варианта обязательно для модели в семействе.')
if not family and variant_label:
    self.add_error('variant_label', 'Уберите название варианта для standalone модели.')
if family and is_default:
    existing = AIModel.objects.filter(
        family=family, is_default_variant=True
    ).exclude(pk=self.instance.pk)
    if existing.exists():
        self.add_error('is_default_variant',
            f'В семействе уже есть вариант по умолчанию: {existing.first().name}')
```

- [ ] **Step 5: Add Step 0 section to change_form.html**

In `backend/templates/admin/ai_providers/aimodel/change_form.html`, insert Step 0 section before existing Step 1. Render the 4 family fields using the same `wf-grid` pattern as other steps. The variant fields (`variant_label`, `variant_sort_order`, `is_default_variant`) should be wrapped in a container with `id="variant-fields-container"` that JS will toggle.

- [ ] **Step 6: Add family field toggle JS**

In `backend/static/admin/ai_providers/aimodel_workflow.js`, add at the top of the `DOMContentLoaded` handler:

```javascript
// Family field visibility toggle
const familySelect = document.getElementById('id_family');
const variantContainer = document.getElementById('variant-fields-container');

function syncFamilyFields() {
    const hasFamily = familySelect && familySelect.value;
    if (variantContainer) {
        variantContainer.style.display = hasFamily ? '' : 'none';
    }
}

if (familySelect) {
    familySelect.addEventListener('change', syncFamilyFields);
    syncFamilyFields();
}
```

- [ ] **Step 7: Verify admin pages**

Open in browser:
- `http://localhost:8000/admin/ai_providers/modelfamily/` — should show empty changelist
- `http://localhost:8000/admin/ai_providers/aimodel/` — should show family column
- Open any existing model — Step 0 "Семейство" should be visible, variant fields hidden when family is empty

- [ ] **Step 8: Commit**

```bash
git add backend/apps/ai_providers/admin.py backend/apps/ai_providers/admin_forms.py
git add backend/templates/admin/ai_providers/aimodel/
git add backend/static/admin/ai_providers/
git commit -m "feat(ai_providers): admin UI for ModelFamily — Step 0, changelist, family page"
```

---

## Task 4: Backend — Clone as variant action

**Files:**
- Modify: `backend/apps/ai_providers/admin.py`

- [ ] **Step 1: Add clone_as_variant view**

Add a custom admin URL and handler to `AIModelAdmin`:

```python
from django.db import transaction
from django.shortcuts import redirect
from django.contrib import messages

def get_urls(self):
    from django.urls import path
    custom_urls = [
        path('<int:pk>/clone-variant/',
             self.admin_site.admin_view(self.clone_as_variant_view),
             name='ai_providers_aimodel_clone_variant'),
    ]
    return custom_urls + super().get_urls()

def clone_as_variant_view(self, request, pk):
    original = AIModel.objects.get(pk=pk)

    with transaction.atomic():
        # Create family if standalone
        if not original.family:
            family = ModelFamily.objects.create(
                name=original.name,
                model_type=original.model_type,
                preview_url=original.preview_url,
                description=original.description,
                tags=original.tags,
            )
            original.family = family
            original.variant_label = original.name
            original.is_default_variant = True
            original.save(update_fields=['family', 'variant_label', 'is_default_variant'])
        else:
            family = original.family

        # Clone model
        clone = AIModel.objects.get(pk=pk)
        clone.pk = None
        clone.name = f'{original.name} (копия)'
        clone.variant_label = '(заполнить)'  # Placeholder — clean() requires non-empty when family is set
        clone.is_default_variant = False
        clone.family = family
        clone.save()

        # Clone parameter bindings
        for binding in original.parameter_bindings.all():
            binding.pk = None
            binding.ai_model = clone
            binding.save()

        # Clone pricing config
        if hasattr(original, 'pricing_config'):
            pc = original.pricing_config
            pc.pk = None
            pc.ai_model = clone
            pc.save()

    messages.success(request, f'Создана копия "{clone.name}" в семействе "{family.name}".')
    return redirect(f'/admin/ai_providers/aimodel/{clone.pk}/change/')
```

- [ ] **Step 2: Add clone button to template**

In `change_form.html`, add a button at the bottom (only for existing objects):

```html
{% if original %}
<div style="text-align: right; padding: 16px 24px;">
    <a href="{% url 'admin:ai_providers_aimodel_clone_variant' original.pk %}"
       class="btn-clone-variant"
       onclick="return confirm('Клонировать модель как новый вариант?');">
        ⊕ Клонировать как вариант
    </a>
</div>
{% endif %}
```

- [ ] **Step 3: Test clone flow**

1. Open existing model (e.g., Veo 3.1 fast)
2. Click "Клонировать как вариант"
3. Verify: ModelFamily created, original bound as default, clone opened for editing
4. Verify: clone has same parameter bindings and pricing

- [ ] **Step 4: Commit**

```bash
git add backend/apps/ai_providers/admin.py
git add backend/templates/admin/ai_providers/aimodel/
git commit -m "feat(ai_providers): clone-as-variant admin action with auto family creation"
```

---

## Task 5: Frontend — Types + Store

**Files:**
- Modify: `frontend/lib/types/index.ts`
- Modify: `frontend/lib/store/generation.ts`

- [ ] **Step 1: Add ModelFamilyBrief type**

In `frontend/lib/types/index.ts`, add before `AIModel` interface (around line 351):

```typescript
export interface ModelFamilyBrief {
  id: number;
  name: string;
  preview_url: string;
  description: string;
  tags: string[];
  variant_ui_control: 'pills' | 'select';
}
```

- [ ] **Step 2: Add family fields to AIModel interface**

In `AIModel` interface, add after `is_active`:

```typescript
family: ModelFamilyBrief | null;
variant_label: string;
is_default_variant: boolean;
variant_sort_order: number;
```

- [ ] **Step 3: Add familyVariants to generation store**

In `frontend/lib/store/generation.ts`:

Add to interface:
```typescript
familyVariants: () => AIModel[];
```

Add implementation in the store:
```typescript
familyVariants: (): AIModel[] => {
    const { selectedModel, availableModels } = get();
    if (!selectedModel?.family) return [];
    return availableModels
        .filter(m => m.family?.id === selectedModel.family!.id)
        .sort((a, b) => a.variant_sort_order - b.variant_sort_order);
},
```

- [ ] **Step 4: Verify build**

```bash
docker compose exec frontend npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/types/index.ts frontend/lib/store/generation.ts
git commit -m "feat(frontend): add ModelFamily types and familyVariants store function"
```

---

## Task 6: Frontend — VariantSwitcher component

**Files:**
- Create: `frontend/components/generation/VariantSwitcher.tsx`

- [ ] **Step 1: Create VariantSwitcher component**

```tsx
'use client';

import { AIModel } from '@/lib/types';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface VariantSwitcherProps {
    variants: AIModel[];
    currentId: number;
    uiControl: 'pills' | 'select';
    onSelect: (model: AIModel) => void;
}

export function VariantSwitcher({ variants, currentId, uiControl, onSelect }: VariantSwitcherProps) {
    if (variants.length < 2) return null;

    if (uiControl === 'select') {
        return (
            <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">Вариант модели</span>
                <Select
                    value={String(currentId)}
                    onValueChange={(val) => {
                        const model = variants.find(m => m.id === Number(val));
                        if (model) onSelect(model);
                    }}
                >
                    <SelectTrigger className="w-full bg-background h-8 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {variants.map(v => (
                            <SelectItem key={v.id} value={String(v.id)} className="text-xs">
                                {v.variant_label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        );
    }

    // Pills mode
    return (
        <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Вариант модели</span>
            <div className="flex gap-1 rounded-lg bg-background/50 p-1">
                {variants.map(v => (
                    <button
                        key={v.id}
                        onClick={() => onSelect(v)}
                        className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                            v.id === currentId
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {v.variant_label}
                    </button>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Verify build**

```bash
docker compose exec frontend npm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/generation/VariantSwitcher.tsx
git commit -m "feat(frontend): add VariantSwitcher component (pills + select modes)"
```

---

## Task 7: Frontend — ConfigPanel integration

**Files:**
- Modify: `frontend/components/generation/ConfigPanel.tsx`

- [ ] **Step 1: Import and wire VariantSwitcher**

Add import:
```typescript
import { VariantSwitcher } from '@/components/generation/VariantSwitcher';
```

Add `familyVariants` to store destructuring:
```typescript
const { ..., familyVariants, selectModel } = useGenerationStore();
```

- [ ] **Step 2: Render VariantSwitcher after model trigger**

Compute variants at component body level (alongside existing `hasParameters`-style computations, NOT inside JSX):

```tsx
const variants = familyVariants();
const showVariantSwitcher = variants.length >= 2 && selectedModel?.family != null;
```

Then in JSX, after the model selector trigger and before `ParametersForm`:

```tsx
{showVariantSwitcher && selectedModel?.family && (
    <VariantSwitcher
        variants={variants}
        currentId={selectedModel.id}
        uiControl={selectedModel.family.variant_ui_control}
        onSelect={selectModel}
    />
)}
```

- [ ] **Step 3: Verify build and visual check**

```bash
docker compose exec frontend npm run build
```

Open browser, verify ConfigPanel renders correctly for standalone models (no switcher visible).

- [ ] **Step 4: Commit**

```bash
git add frontend/components/generation/ConfigPanel.tsx
git commit -m "feat(frontend): integrate VariantSwitcher into ConfigPanel"
```

---

## Task 8: Frontend — ModelSelector grouping

**Files:**
- Modify: `frontend/components/generation/ModelSelector.tsx`

- [ ] **Step 1: Add grouping logic**

After `filteredModels` is computed, add grouping:

```typescript
// Build display items: one entry per family or standalone model
type DisplayItem = {
    type: 'family';
    familyId: number;
    name: string;
    preview_url: string;
    description: string;
    tags: string[];
    defaultVariant: AIModel;
    isSelected: boolean;
} | {
    type: 'standalone';
    model: AIModel;
    isSelected: boolean;
};

const displayItems: DisplayItem[] = (() => {
    const familiesSeen = new Map<number, DisplayItem>();
    const items: DisplayItem[] = [];

    for (const model of filteredModels) {
        if (model.family) {
            if (!familiesSeen.has(model.family.id)) {
                const item: DisplayItem = {
                    type: 'family',
                    familyId: model.family.id,
                    name: model.family.name,
                    preview_url: model.family.preview_url,
                    description: model.family.description,
                    tags: model.family.tags,
                    defaultVariant: model.is_default_variant ? model : model,
                    isSelected: selectedModelId != null && model.family.id === selectedModel?.family?.id,
                };
                familiesSeen.set(model.family.id, item);
                items.push(item);
            }
            // Update default variant if found
            const existing = familiesSeen.get(model.family.id)!;
            if (existing.type === 'family' && model.is_default_variant) {
                existing.defaultVariant = model;
            }
            // Update isSelected
            if (existing.type === 'family' && model.id === selectedModelId) {
                existing.isSelected = true;
            }
        } else {
            items.push({
                type: 'standalone',
                model,
                isSelected: model.id === selectedModelId,
            });
        }
    }
    // Sort: family cards by sort_order (from family data), standalone alphabetically after
    items.sort((a, b) => {
        const aIsFamily = a.type === 'family';
        const bIsFamily = b.type === 'family';
        // Families first, then standalone
        if (aIsFamily && !bIsFamily) return -1;
        if (!aIsFamily && bIsFamily) return 1;
        // Both families: by sort_order (lower = earlier)
        if (aIsFamily && bIsFamily) return 0; // already in API order
        // Both standalone: alphabetical
        const aName = a.type === 'standalone' ? a.model.name : '';
        const bName = b.type === 'standalone' ? b.model.name : '';
        return aName.localeCompare(bName);
    });

    return items;
})();
```

- [ ] **Step 2: Update render loop**

Replace the existing `filteredModels.map()` in the render with:

```tsx
{displayItems.map(item => {
    if (item.type === 'family') {
        return (
            <ModelCard
                key={`family-${item.familyId}`}
                model={{
                    ...item.defaultVariant,
                    name: item.name,
                    preview_url: item.preview_url,
                    description: item.description,
                    tags: item.tags,
                }}
                isSelected={item.isSelected}
                onSelect={() => onSelectModel(item.defaultVariant)}
            />
        );
    }
    return (
        <ModelCard
            key={item.model.id}
            model={item.model}
            isSelected={item.isSelected}
            onSelect={() => onSelectModel(item.model)}
        />
    );
})}
```

- [ ] **Step 3: Verify build**

```bash
docker compose exec frontend npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/components/generation/ModelSelector.tsx
git commit -m "feat(frontend): group family models into single cards in ModelSelector"
```

---

## Task 9: End-to-end verification

- [ ] **Step 1: Create test family via admin**

1. Go to `/admin/ai_providers/modelfamily/add/`
2. Create "Veo 3.1" family (VIDEO, variant_ui_control=pills)
3. Edit existing "Veo 3.1 fast" model → set family="Veo 3.1", variant_label="Fast", is_default=True
4. Clone "Veo 3.1 fast" as variant → edit clone: variant_label="Quality", change endpoint if needed

- [ ] **Step 2: Verify frontend**

1. Open workspace in browser
2. Model picker should show ONE "Veo 3.1" card (not two separate)
3. Select it → ConfigPanel shows pill switcher: Fast | Quality
4. Click Quality → parameters/pricing reload
5. Standalone models (Nano-Banana-2) should work exactly as before

- [ ] **Step 3: Test dropdown mode**

1. In admin, change family variant_ui_control to "select"
2. Refresh frontend
3. Verify select dropdown appears instead of pills

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Model Families — group AI model variants with switcher in ConfigPanel"
```
