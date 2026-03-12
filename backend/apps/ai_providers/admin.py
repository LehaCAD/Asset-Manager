from django.contrib import admin
from django.utils.html import format_html

from .admin_forms import AIModelAdminForm
from .admin_inlines import ModelParameterBindingInline, ModelPricingConfigInline
from .models import AIProvider, AIModel


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


@admin.register(AIModel)
class AIModelAdmin(admin.ModelAdmin):
    form = AIModelAdminForm
    inlines = [ModelParameterBindingInline, ModelPricingConfigInline]
    list_display = ('name', 'provider', 'model_type', 'is_active', 'api_endpoint_display', 'created_at')
    list_filter = ('model_type', 'is_active', 'provider')
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
        ('Model Identity', {'fields': ('provider', 'name', 'model_type', 'is_active')}),
        (
            'Request Mapping',
            {
                'fields': ('api_endpoint', 'full_url_display', 'request_schema'),
                'description': 'Transport template and placeholder discovery live here.',
            },
        ),
        (
            'UI Parameter Overrides',
            {
                'fields': ('preview_url', 'description', 'tags'),
                'description': 'Model-specific UI metadata and binding overrides are managed via inline records.',
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
        ('Timestamps', {'fields': ('created_at', 'updated_at'), 'classes': ('collapse',)}),
    )

    def api_endpoint_display(self, obj):
        if len(obj.api_endpoint) > 30:
            return obj.api_endpoint[:30] + '...'
        return obj.api_endpoint

    api_endpoint_display.short_description = 'Эндпоинт'

    def full_url_display(self, obj):
        return format_html('<code style="background:#f0f0f0;padding:5px;display:block;">{}</code>', obj.get_full_url())

    full_url_display.short_description = 'Полный URL'

    def compiled_parameters_preview(self, obj):
        return obj.get_runtime_parameters_schema()

    compiled_parameters_preview.short_description = 'Compiled parameters'

    def compiled_pricing_preview(self, obj):
        return obj.get_runtime_pricing_schema()

    compiled_pricing_preview.short_description = 'Compiled pricing'
