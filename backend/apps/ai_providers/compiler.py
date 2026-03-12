from __future__ import annotations

import re
from typing import Any

from .models import AIModel, CanonicalParameter


PLACEHOLDER_PATTERN = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")


def extract_placeholders(request_schema: Any) -> set[str]:
    placeholders: set[str] = set()

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            for nested in value.values():
                walk(nested)
            return
        if isinstance(value, list):
            for nested in value:
                walk(nested)
            return
        if isinstance(value, str):
            for match in PLACEHOLDER_PATTERN.findall(value):
                placeholders.add(match)

    walk(request_schema)
    return placeholders


def match_placeholder_to_canonical(placeholder: str, model_type: str | None = None) -> CanonicalParameter | None:
    del model_type

    exact_match = CanonicalParameter.objects.filter(code=placeholder).first()
    if exact_match:
        return exact_match

    for parameter in CanonicalParameter.objects.all():
        aliases = parameter.aliases or []
        if placeholder in aliases:
            return parameter
    return None


def compile_parameters_schema(ai_model: AIModel) -> list[dict[str, Any]]:
    bindings = ai_model.parameter_bindings.select_related('canonical_parameter').order_by('sort_order', 'id')
    compiled: list[dict[str, Any]] = []

    for binding in bindings:
        parameter = binding.canonical_parameter
        options = binding.options_override or parameter.base_options or []
        item = {
            'request_key': binding.placeholder,
            'label': binding.label_override or parameter.code.replace('_', ' ').title(),
            'ui_semantic': parameter.ui_semantic,
            'value_type': parameter.value_type,
            'control': parameter.default_ui_control,
            'options': options,
            'advanced': binding.is_advanced,
            'visible': binding.is_visible,
        }
        default_value = binding.default_override
        if default_value not in ({}, None, ''):
            item['default'] = default_value
        compiled.append(item)

    return compiled


def compile_pricing_payload(ai_model: AIModel) -> dict[str, Any]:
    pricing_config = getattr(ai_model, 'pricing_config', None)
    if pricing_config is None:
        return ai_model.pricing_schema or {}

    if pricing_config.mode == pricing_config.MODE_FIXED:
        return pricing_config.compiled_payload or ai_model.pricing_schema or {}

    return {
        'cost_params': pricing_config.dimensions or [],
        'costs': pricing_config.raw_lookup or {},
    }
