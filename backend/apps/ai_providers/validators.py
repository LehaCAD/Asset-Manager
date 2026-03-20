from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError

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


def _validate_slot(slot: Any, path: str, seen_keys: set[str]) -> None:
    """Validate a single image input slot dict."""
    if not isinstance(slot, dict):
        raise ValidationError(f'{path}: слот должен быть объектом.')

    # Required fields
    if 'key' not in slot:
        raise ValidationError(f'{path}: отсутствует обязательное поле "key".')
    if not isinstance(slot['key'], str):
        raise ValidationError(f'{path}: "key" должен быть строкой.')

    if 'label' not in slot:
        raise ValidationError(f'{path}: отсутствует обязательное поле "label".')
    if not isinstance(slot['label'], str):
        raise ValidationError(f'{path}: "label" должен быть строкой.')

    if 'max' not in slot:
        raise ValidationError(f'{path}: отсутствует обязательное поле "max".')
    if not isinstance(slot['max'], int):
        raise ValidationError(f'{path}: "max" должен быть целым числом.')

    slot_key = slot['key']
    if slot_key in seen_keys:
        raise ValidationError(f'{path}: дублирующийся ключ слота "{slot_key}".')
    seen_keys.add(slot_key)

    min_val = slot.get('min', 0)
    if not isinstance(min_val, int):
        raise ValidationError(f'{path}: "min" должен быть целым числом.')
    if min_val > slot['max']:
        raise ValidationError(
            f'{path}: "min" ({min_val}) не может быть больше "max" ({slot["max"]}).'
        )


def validate_image_inputs_schema(value: Any) -> None:
    """Validate image_inputs_schema field value.

    Accepts two formats:
    - Simple (list): list of slot dicts
    - Groups (dict): {"mode": "groups", "groups": [...], ...}
    """
    # None or empty list — valid
    if value is None or value == []:
        return

    if isinstance(value, list):
        seen_keys: set[str] = set()
        for i, slot in enumerate(value):
            _validate_slot(slot, f'slots[{i}]', seen_keys)
        return

    if isinstance(value, dict):
        if value.get('mode') != 'groups':
            raise ValidationError(
                'image_inputs_schema dict должен иметь "mode": "groups".'
            )

        if 'groups' not in value or not isinstance(value['groups'], list):
            raise ValidationError('"groups" должен быть непустым списком.')
        if len(value['groups']) == 0:
            raise ValidationError('"groups" должен быть непустым списком.')

        # Optional top-level field
        if 'no_images_params' in value and not isinstance(value['no_images_params'], dict):
            raise ValidationError('"no_images_params" должен быть объектом.')

        seen_group_keys: set[str] = set()
        all_slot_keys: set[str] = set()
        group_slot_keys: dict[str, set[str]] = {}  # group_key -> set of slot keys in that group

        for gi, group in enumerate(value['groups']):
            if not isinstance(group, dict):
                raise ValidationError(f'groups[{gi}]: группа должна быть объектом.')
            if 'key' not in group:
                raise ValidationError(f'groups[{gi}]: отсутствует обязательное поле "key".')
            gkey = group['key']
            if gkey in seen_group_keys:
                raise ValidationError(f'Дублирующийся ключ группы "{gkey}".')
            seen_group_keys.add(gkey)

            if 'slots' not in group or not isinstance(group.get('slots'), list):
                raise ValidationError(f'groups[{gi}]: отсутствует обязательное поле "slots".')
            if len(group['slots']) == 0:
                raise ValidationError(f'groups[{gi}]: "slots" не может быть пустым.')

            group_slot_set: set[str] = set()
            for si, slot in enumerate(group['slots']):
                _validate_slot(slot, f'groups[{gi}].slots[{si}]', all_slot_keys)
                group_slot_set.add(slot['key'])
            group_slot_keys[gkey] = group_slot_set

            if 'extra_params' in group and not isinstance(group['extra_params'], dict):
                raise ValidationError(
                    f'Группа "{gkey}": extra_params должен быть объектом.'
                )

        # Cross-reference: depends_on must reference slot key within SAME group
        for gi, group in enumerate(value['groups']):
            gkey = group['key']
            for si, slot in enumerate(group['slots']):
                if 'depends_on' in slot:
                    dep = slot['depends_on']
                    if dep not in group_slot_keys[gkey]:
                        raise ValidationError(
                            f'groups[{gi}].slots[{si}]: "depends_on" ссылается на '
                            f'несуществующий слот "{dep}" в группе "{gkey}".'
                        )

        # Cross-reference: exclusive_with must reference existing group keys, not self
        for gi, group in enumerate(value['groups']):
            gkey = group['key']
            if 'exclusive_with' in group:
                if not isinstance(group['exclusive_with'], list):
                    raise ValidationError(
                        f'groups[{gi}]: "exclusive_with" должен быть списком.'
                    )
                for ref in group['exclusive_with']:
                    if ref == gkey:
                        raise ValidationError(
                            f'groups[{gi}]: "exclusive_with" не может ссылаться на себя ("{gkey}").'
                        )
                    if ref not in seen_group_keys:
                        raise ValidationError(
                            f'groups[{gi}]: "exclusive_with" ссылается на '
                            f'несуществующую группу "{ref}".'
                        )
        return

    raise ValidationError(
        'image_inputs_schema должен быть списком или объектом с "mode": "groups".'
    )


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
