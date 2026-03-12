from __future__ import annotations

from typing import Any

from .compiler import compile_parameters_schema, compile_pricing_payload
from .models import AIModel, CanonicalParameter, ModelParameterBinding, ModelPricingConfig


CONTROL_TO_VALUE_TYPE = {
    'select': CanonicalParameter.VALUE_TYPE_ENUM,
    'toggle_group': CanonicalParameter.VALUE_TYPE_ENUM,
    'slider': CanonicalParameter.VALUE_TYPE_INTEGER,
    'number': CanonicalParameter.VALUE_TYPE_INTEGER,
    'switch': CanonicalParameter.VALUE_TYPE_BOOLEAN,
}


def _infer_value_type(config: dict[str, Any]) -> str:
    control = config.get('type')
    if control in CONTROL_TO_VALUE_TYPE:
        return CONTROL_TO_VALUE_TYPE[control]
    default = config.get('default')
    if isinstance(default, bool):
        return CanonicalParameter.VALUE_TYPE_BOOLEAN
    if isinstance(default, int):
        return CanonicalParameter.VALUE_TYPE_INTEGER
    if isinstance(default, float):
        return CanonicalParameter.VALUE_TYPE_DECIMAL
    return CanonicalParameter.VALUE_TYPE_STRING


def backfill_ai_model(ai_model: AIModel) -> AIModel:
    legacy_schema = ai_model.parameters_schema if isinstance(ai_model.parameters_schema, dict) else {}

    for index, (request_key, config) in enumerate(legacy_schema.items()):
        config = config or {}
        parameter, _created = CanonicalParameter.objects.get_or_create(
            code=request_key,
            defaults={
                'ui_semantic': request_key,
                'value_type': _infer_value_type(config),
                'default_ui_control': config.get('type', 'select'),
                'aliases': [request_key],
                'base_options': [{'value': value, 'label': str(value)} for value in config.get('options', [])],
                'config': {
                    'min': config.get('min'),
                    'max': config.get('max'),
                    'step': config.get('step'),
                },
            },
        )

        ModelParameterBinding.objects.get_or_create(
            ai_model=ai_model,
            canonical_parameter=parameter,
            defaults={
                'placeholder': request_key,
                'request_path': request_key,
                'default_override': config.get('default', {}),
                'sort_order': index,
            },
        )

    pricing_schema = ai_model.pricing_schema or {}
    if 'fixed_cost' in pricing_schema:
        ModelPricingConfig.objects.update_or_create(
            ai_model=ai_model,
            defaults={
                'mode': ModelPricingConfig.MODE_FIXED,
                'dimensions': [],
                'raw_lookup': {},
                'compiled_payload': pricing_schema,
            },
        )
    elif 'cost_params' in pricing_schema and 'costs' in pricing_schema:
        ModelPricingConfig.objects.update_or_create(
            ai_model=ai_model,
            defaults={
                'mode': ModelPricingConfig.MODE_LOOKUP,
                'dimensions': pricing_schema.get('cost_params', []),
                'raw_lookup': pricing_schema.get('costs', {}),
                'compiled_payload': pricing_schema,
            },
        )

    ai_model.parameters_schema = compile_parameters_schema(ai_model)
    ai_model.pricing_schema = compile_pricing_payload(ai_model)
    ai_model.save(update_fields=['parameters_schema', 'pricing_schema', 'updated_at'])
    return ai_model
