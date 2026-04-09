import json

from django.contrib import admin
from django.utils.html import format_html

from .admin_forms import AIModelAdminForm
from .admin_workflow import FIELD_TYPE_PRESETS, ROLE_CHOICES, UI_SEMANTIC_PRESETS, build_admin_workflow_context
from .models import AIProvider, AIModel, CanonicalParameter, ModelFamily


@admin.register(AIProvider)
class AIProviderAdmin(admin.ModelAdmin):
    list_display = ('name', 'base_url_display', 'is_active', 'models_count', 'created_at')
    list_filter = ('is_active', 'created_at')
    search_fields = ('name', 'base_url')
    list_editable = ('is_active',)
    readonly_fields = ('created_at', 'updated_at')
    ordering = ('name',)

    fieldsets = (
        ('Основная информация', {'fields': ('name', 'base_url', 'api_key', 'is_active')}),
        ('Временные метки', {'fields': ('created_at', 'updated_at'), 'classes': ('collapse',)}),
    )

    def base_url_display(self, obj):
        if len(obj.base_url) > 40:
            return obj.base_url[:40] + '...'
        return obj.base_url

    base_url_display.short_description = 'Base URL'

    def models_count(self, obj):
        count = obj.models.count()
        active_count = obj.models.filter(is_active=True).count()
        return format_html('<b>{}</b> / {}', active_count, count)

    models_count.short_description = 'Модели (активных/всего)'


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


@admin.register(AIModel)
class AIModelAdmin(admin.ModelAdmin):
    form = AIModelAdminForm
    inlines = []
    change_form_template = 'admin/ai_providers/aimodel/change_form.html'
    list_display = ('name', 'provider', 'model_type', 'is_active', 'family_display', 'variant_label_display', 'api_endpoint_display', 'created_at')
    list_filter = ('model_type', 'is_active', 'provider', 'family')
    search_fields = ('name', 'api_endpoint')
    list_editable = ('is_active',)
    readonly_fields = (
        'created_at',
        'updated_at',
        'full_url_display',
        'compiled_parameters_preview',
        'compiled_pricing_preview',
    )
    ordering = ('provider', 'name')

    fieldsets = (
        ('Семейство', {
            'fields': ('family', 'variant_label', 'variant_sort_order', 'is_default_variant'),
            'description': 'Привяжите модель к семейству для группировки вариантов.',
        }),
        ('Model Identity', {'fields': ('provider', 'name', 'model_type', 'is_active')}),
        (
            'Карточка модели',
            {
                'fields': ('preview_url', 'tags', 'description'),
                'description': 'Превью, теги-бейджи и описание для карточки в селекторе моделей.',
            },
        ),
        (
            'Request Mapping',
            {
                'fields': ('api_endpoint', 'full_url_display', 'request_schema', 'status_check_endpoint', 'response_mapping'),
                'description': 'Transport template and placeholder discovery live here.',
            },
        ),
        (
            'Pricing',
            {
                'fields': ('pricing_schema',),
                'description': (
                    'Используйте fixed cost или lookup payload. '
                    'Примеры: {"fixed_cost": "5.00"} '
                    'и {"cost_params": ["resolution", "duration"], "costs": {"720p|5": "3.00"}}'
                ),
            },
        ),
        (
            'Advanced Mode',
            {
                'fields': ('parameters_schema', 'image_inputs_schema'),
                'description': 'Legacy JSON cache and advanced provider-specific overrides.',
            },
        ),
        (
            'Compiled Preview',
            {
                'fields': ('compiled_parameters_preview', 'compiled_pricing_preview'),
                'description': 'Runtime payload compiled from normalized records.',
            },
        ),
        ('Временные метки', {'fields': ('created_at', 'updated_at'), 'classes': ('collapse',)}),
    )

    def api_endpoint_display(self, obj):
        if len(obj.api_endpoint) > 30:
            return obj.api_endpoint[:30] + '...'
        return obj.api_endpoint

    api_endpoint_display.short_description = 'Эндпоинт'

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

    def full_url_display(self, obj):
        return format_html('<code style="background:#f0f0f0;padding:5px;display:block;">{}</code>', obj.get_full_url())

    full_url_display.short_description = 'Полный URL'

    def compiled_parameters_preview(self, obj):
        return obj.get_runtime_parameters_schema()

    compiled_parameters_preview.short_description = 'Compiled parameters'

    def compiled_pricing_preview(self, obj):
        return obj.get_runtime_pricing_schema()

    compiled_pricing_preview.short_description = 'Compiled pricing'

    class Media:
        css = {
            'all': ('admin/ai_providers/aimodel_workflow.css',),
        }
        js = (
            'admin/ai_providers/aimodel_workflow.js',
            'admin/ai_providers/aimodel_image_inputs.js',
        )

    def get_workflow_context(
        self,
        request,
        obj=None,
        form_post_payload: str | None = None,
        form_has_errors: bool = False,
    ):
        common = {
            'canonical_parameter_choices': list(
                CanonicalParameter.objects.order_by('ui_semantic', 'code').values('code', 'ui_semantic')
            ),
            'ui_semantic_choices': list(UI_SEMANTIC_PRESETS.keys()),
            'field_type_choices': list(FIELD_TYPE_PRESETS.items()),
            'role_choices': ROLE_CHOICES,
        }
        if obj is None:
            return {
                'mapping_rows': [],
                'mapping_payload_json': '[]',
                'pricing': {},
                'compiled_preview': {},
                'summary': {},
                'pricing_dimension_choices': [],
                'image_inputs_schema_json': '[]',
                **common,
            }

        context = build_admin_workflow_context(
            obj,
            form_post_payload=form_post_payload,
            form_has_errors=form_has_errors,
        )
        context['mapping_rows'] = sorted(
            context['mapping_rows'],
            key=lambda row: (
                0 if row['role'] == 'param' else 1,
                row.get('sort_index', 999),
            ),
        )
        context.update(common)
        pricing_dimensions = []
        seen_dimension_codes = set()
        for row in context['mapping_rows']:
            if row['role'] != 'param':
                continue
            code = row['canonical_code'] or row['suggested_canonical_code'] or row['parameter_code']
            if not code or code in seen_dimension_codes:
                continue
            seen_dimension_codes.add(code)
            pricing_dimensions.append({'code': code, 'label': row['label']})
        context['pricing_dimension_choices'] = pricing_dimensions
        context['image_inputs_schema_json'] = json.dumps(obj.image_inputs_schema or []).replace('</', '<\\/')
        return context

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        instance = form.instance
        if hasattr(form, '_mapping_rows') and form._mapping_rows:
            form._save_mapping_rows(instance, form._mapping_rows)
        if hasattr(form, '_pricing_mode'):
            form._save_pricing_config(instance)

    def render_change_form(self, request, context, add=False, change=False, form_url='', obj=None):
        form = context.get('form')
        workflow = self.get_workflow_context(
            request,
            obj=obj,
            form_post_payload=form.data.get('mapping_payload') if form and form.data else None,
            form_has_errors=bool(form and form.errors),
        )
        context = {
            **context,
            'workflow': workflow,
        }
        return super().render_change_form(request, context, add=add, change=change, form_url=form_url, obj=obj)
