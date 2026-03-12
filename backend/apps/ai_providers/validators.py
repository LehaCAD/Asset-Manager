from __future__ import annotations

from typing import Any

from .compiler import PLACEHOLDER_PATTERN, compile_parameters_schema, compile_pricing_payload
from .models import AIModel

SYSTEM_PLACEHOLDERS = {'prompt', 'callback_url'}


def _iter_placeholders_in_order(value: Any):
    if isinstance(value, dict):
        for nested in value.values():
            yield from _iter_placeholders_in_order(nested)
        return
    if isinstance(value, list):
        for nested in value:
            yield from _iter_placeholders_in_order(nested)
        return
    if isinstance(value, str):
        for match in PLACEHOLDER_PATTERN.findall(value):
            yield match


def validate_model_admin_config(ai_model: AIModel) -> None:
    bindings = {
        binding.placeholder: binding
        for binding in ai_model.parameter_bindings.select_related('canonical_parameter').all()
    }

    seen_placeholders: set[str] = set()
    for placeholder in _iter_placeholders_in_order(ai_model.request_schema):
        if placeholder in seen_placeholders:
            continue
        seen_placeholders.add(placeholder)
        if placeholder in SYSTEM_PLACEHOLDERS:
            continue
        if placeholder not in bindings:
            raise ValueError(f'Плейсхолдер "{placeholder}" не связан с каноническим параметром.')

    compile_parameters_schema(ai_model)

    pricing_payload = compile_pricing_payload(ai_model)
    if 'cost_params' in pricing_payload:
        bound_codes = {binding.canonical_parameter.code for binding in bindings.values()}
        for dimension in pricing_payload.get('cost_params', []):
            if dimension not in bound_codes:
                raise ValueError(f'Параметр pricing "{dimension}" не подключён к модели.')
