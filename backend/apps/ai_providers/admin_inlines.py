from django.contrib import admin

from .models import ModelParameterBinding, ModelPricingConfig


class ModelParameterBindingInline(admin.TabularInline):
    model = ModelParameterBinding
    extra = 0
    fields = (
        'canonical_parameter',
        'placeholder',
        'request_path',
        'label_override',
        'default_override',
        'options_override',
        'is_visible',
        'is_advanced',
        'sort_order',
    )


class ModelPricingConfigInline(admin.StackedInline):
    model = ModelPricingConfig
    extra = 0
    max_num = 1
