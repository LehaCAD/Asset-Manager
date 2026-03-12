from __future__ import annotations

import json
from typing import Any

from .compiler import match_placeholder_to_canonical
from .models import AIModel


ROLE_CHOICES = [
    ('param', 'Параметр интерфейса'),
    ('prompt', 'Промпт (основной текст)'),
    ('callback', 'Callback (системный)'),
    ('auto_input', 'Входные файлы (авто)'),
    ('hidden', 'Скрытый параметр'),
]

SYSTEM_ROLES = {'prompt', 'callback', 'auto_input', 'hidden'}

ROLE_DESCRIPTIONS = {
    'prompt': 'Основное текстовое поле промпта. Бэкенд подставит введённый пользователем текст.',
    'callback': 'Служебный URL для получения результата. Бэкенд подставит автоматически.',
    'auto_input': 'Список файлов (изображений). Подставляется из выбранных элементов рабочей области.',
    'hidden': 'Параметр отправляется в API, но не отображается в интерфейсе пользователя.',
}

# Keep for backward-compatible import in admin_forms
SYSTEM_PLACEHOLDERS = set()
AUTOMATIC_INPUT_PLACEHOLDERS = set()

UI_SEMANTIC_PRESETS = {
    'resolution': {'label': 'Resolution', 'value_type': 'enum', 'default_ui_control': 'select'},
    'aspect_ratio': {'label': 'Aspect ratio', 'value_type': 'enum', 'default_ui_control': 'toggle_group'},
    'output_format': {'label': 'Output format', 'value_type': 'enum', 'default_ui_control': 'select'},
    'boolean_toggle': {'label': 'Boolean toggle', 'value_type': 'boolean', 'default_ui_control': 'switch'},
    'image_list': {'label': 'Image list', 'value_type': 'string', 'default_ui_control': 'image_picker'},
    'text': {'label': 'Text', 'value_type': 'string', 'default_ui_control': 'text'},
    'integer': {'label': 'Integer', 'value_type': 'integer', 'default_ui_control': 'number'},
}

FIELD_TYPE_PRESETS = {
    'text': {
        'label': 'Текст',
        'ui_semantic': 'text',
        'value_type': 'string',
        'default_ui_control': 'text',
    },
    'select': {
        'label': 'Список',
        'ui_semantic': 'resolution',
        'value_type': 'enum',
        'default_ui_control': 'select',
    },
    'toggle_group': {
        'label': 'Кнопки выбора',
        'ui_semantic': 'aspect_ratio',
        'value_type': 'enum',
        'default_ui_control': 'toggle_group',
    },
    'checkbox': {
        'label': 'Переключатель',
        'ui_semantic': 'boolean_toggle',
        'value_type': 'boolean',
        'default_ui_control': 'switch',
    },
    'image_upload': {
        'label': 'Загрузка изображений',
        'ui_semantic': 'image_list',
        'value_type': 'string',
        'default_ui_control': 'image_picker',
    },
    'number': {
        'label': 'Число',
        'ui_semantic': 'integer',
        'value_type': 'integer',
        'default_ui_control': 'number',
    },
}

CONTROL_TO_FIELD_TYPE = {
    'text': 'text',
    'textarea': 'text',
    'select': 'select',
    'toggle_group': 'toggle_group',
    'switch': 'checkbox',
    'checkbox': 'checkbox',
    'image_picker': 'image_upload',
    'number': 'number',
}


def suggest_role(placeholder: str) -> str:
    """Suggest a role based on placeholder name. Admin can override."""
    normalized = placeholder.lower()
    if 'prompt' in normalized or normalized in ('text', 'text_input', 'message'):
        return 'prompt'
    if 'callback' in normalized or 'webhook' in normalized or 'notify' in normalized:
        return 'callback'
    if ('input' in normalized or 'source' in normalized) and (
        'url' in normalized or 'image' in normalized or 'file' in normalized
    ):
        return 'auto_input'
    return 'param'


def suggest_ui_semantic(placeholder: str) -> str:
    normalized = placeholder.lower()
    if 'aspect' in normalized:
        return 'aspect_ratio'
    if 'resolution' in normalized or 'size' in normalized:
        return 'resolution'
    if 'format' in normalized:
        return 'output_format'
    if normalized.startswith('is_') or normalized.endswith('_enabled') or 'search' in normalized:
        return 'boolean_toggle'
    if 'image' in normalized or normalized.endswith('_urls') or normalized.endswith('_images'):
        return 'image_list'
    if 'count' in normalized or 'steps' in normalized or 'seed' in normalized:
        return 'integer'
    return 'text'


def suggest_field_type(placeholder: str) -> str:
    semantic = suggest_ui_semantic(placeholder)
    if semantic == 'aspect_ratio':
        return 'toggle_group'
    if semantic in {'resolution', 'output_format'}:
        return 'select'
    if semantic == 'boolean_toggle':
        return 'checkbox'
    if semantic == 'image_list':
        return 'image_upload'
    if semantic == 'integer':
        return 'number'
    return 'text'


def humanize_placeholder(placeholder: str) -> str:
    custom = {
        'prompt': 'Промпт',
        'input_urls': 'Входные изображения',
        'aspect_ratio': 'Соотношение сторон',
        'google_search': 'Поиск Google',
        'output_format': 'Формат результата',
        'callback_url': 'Callback URL',
        'resolution': 'Разрешение',
    }
    return custom.get(placeholder, placeholder.replace('_', ' ').capitalize())


def describe_placeholder_for_admin(placeholder: str) -> str:
    descriptions = {
        'aspect_ratio': 'Формат кадра. Удобно показывать 2-3 Быстрых варианта, а остальные убирать в «Другое».',
        'resolution': 'Размер или качество результата. Обычно это список готовых вариантов.',
        'output_format': 'Формат итогового файла, например PNG или JPEG.',
        'google_search': 'Включает или отключает дополнительный поиск. Обычно это один чекбокс.',
    }
    return descriptions.get(placeholder, '')


def split_options_for_display(options: list[dict[str, Any]]) -> tuple[str, str, bool]:
    normalized = [option for option in options if isinstance(option, dict) and option.get('value') is not None]
    if not normalized:
        return '', '', False

    featured = [opt for opt in normalized if opt.get('featured')]
    if not featured:
        featured = normalized[:3]
    featured_values = [str(opt['value']) for opt in featured]
    all_values = [str(opt['value']) for opt in normalized]
    show_other = any(value not in featured_values for value in all_values)
    return '\n'.join(all_values), '\n'.join(featured_values), show_other


def build_options_for_chips(options: list[dict[str, Any]], max_featured: int = 3) -> dict[str, Any]:
    normalized = [option for option in options if isinstance(option, dict) and option.get('value') is not None]
    if not normalized:
        return {'featured': [], 'overflow': [], 'overflow_count': 0, 'all_values': []}

    featured = [opt for opt in normalized if opt.get('featured')]
    if not featured:
        featured = normalized[:max_featured]
    featured_set = {str(opt['value']) for opt in featured}
    overflow = [str(opt['value']) for opt in normalized if str(opt['value']) not in featured_set]
    return {
        'featured': [str(opt['value']) for opt in featured],
        'overflow': overflow,
        'overflow_count': len(overflow),
        'all_values': [str(opt['value']) for opt in normalized],
    }


def _derive_role_from_binding(binding) -> str:
    """Derive the role of a saved binding from its stored properties."""
    if binding.is_visible:
        return 'param'
    canonical_code = binding.canonical_parameter.code if binding.canonical_parameter else ''
    ui_semantic = binding.canonical_parameter.ui_semantic if binding.canonical_parameter else ''
    if ui_semantic == 'image_list' or canonical_code in ('input_urls', 'source_images', 'input_images'):
        return 'auto_input'
    return 'hidden'


def _walk_placeholders(value: Any, path_parts: list[str] | None = None) -> list[dict[str, str]]:
    path_parts = path_parts or []
    entries: list[dict[str, str]] = []

    if isinstance(value, dict):
        for key, nested in value.items():
            entries.extend(_walk_placeholders(nested, [*path_parts, str(key)]))
        return entries

    if isinstance(value, list):
        for index, nested in enumerate(value):
            entries.extend(_walk_placeholders(nested, [*path_parts, str(index)]))
        return entries

    if isinstance(value, str) and value.startswith('{{') and value.endswith('}}'):
        placeholder = value[2:-2].strip()
        entries.append(
            {
                'placeholder': placeholder,
                'request_path': '.'.join(path_parts),
            }
        )
    return entries


def discover_placeholder_entries(request_schema: Any) -> list[dict[str, str]]:
    seen: set[str] = set()
    entries: list[dict[str, str]] = []
    for entry in _walk_placeholders(request_schema):
        placeholder = entry['placeholder']
        if placeholder in seen:
            continue
        seen.add(placeholder)
        entries.append(entry)
    return entries


def build_mapping_rows(ai_model: AIModel) -> list[dict[str, Any]]:
    bindings = {
        binding.placeholder: binding
        for binding in ai_model.parameter_bindings.select_related('canonical_parameter').all()
    }
    rows: list[dict[str, Any]] = []

    for index, entry in enumerate(discover_placeholder_entries(ai_model.request_schema)):
        placeholder = entry['placeholder']
        binding = bindings.get(placeholder)
        suggested = match_placeholder_to_canonical(placeholder, ai_model.model_type)

        if binding is not None:
            role = _derive_role_from_binding(binding)
            status = 'mapped'
        else:
            role = suggest_role(placeholder)
            status = 'suggested' if suggested is not None else 'needs_mapping'

        suggested_role = suggest_role(placeholder)

        rows.append(
            {
                'placeholder': placeholder,
                'request_path': binding.request_path if binding is not None and binding.request_path else entry['request_path'],
                'status': status,
                'sort_index': index,
                'role': role,
                'suggested_role': suggested_role,
                'role_description': ROLE_DESCRIPTIONS.get(role, ''),
                'binding_id': binding.id if binding is not None else None,
                'canonical_code': binding.canonical_parameter.code if binding is not None else '',
                'parameter_code': binding.canonical_parameter.code if binding is not None else (suggested.code if suggested is not None else placeholder),
                'suggested_canonical_code': suggested.code if binding is None and suggested is not None else '',
                'ui_semantic': binding.canonical_parameter.ui_semantic if binding is not None else (suggested.ui_semantic if suggested is not None else suggest_ui_semantic(placeholder)),
                'label': binding.label_override if binding is not None and binding.label_override else humanize_placeholder(placeholder),
                'field_type': (
                    CONTROL_TO_FIELD_TYPE.get(binding.canonical_parameter.default_ui_control, suggest_field_type(placeholder))
                    if binding is not None else suggest_field_type(placeholder)
                ),
                'field_type_label': FIELD_TYPE_PRESETS[
                    CONTROL_TO_FIELD_TYPE.get(binding.canonical_parameter.default_ui_control, suggest_field_type(placeholder))
                    if binding is not None else suggest_field_type(placeholder)
                ]['label'],
                'all_options_text': split_options_for_display(binding.options_override or binding.canonical_parameter.base_options or [])[0] if binding is not None else '',
                'featured_options_text': split_options_for_display(binding.options_override or binding.canonical_parameter.base_options or [])[1] if binding is not None else '',
                'show_other_modal': split_options_for_display(binding.options_override or binding.canonical_parameter.base_options or [])[2] if binding is not None else False,
                'featured_count': (
                    len([v for v in split_options_for_display(binding.options_override or binding.canonical_parameter.base_options or [])[1].split('\n') if v.strip()])
                    if binding is not None else 3
                ) or 3,
                'chips': build_options_for_chips(
                    binding.options_override or binding.canonical_parameter.base_options or [], 3
                ) if binding is not None else {'featured': [], 'overflow': [], 'overflow_count': 0, 'all_values': []},
                'editor_hint': describe_placeholder_for_admin(placeholder),
            }
        )

    return rows


def build_pricing_context(ai_model: AIModel) -> dict[str, Any]:
    pricing_config = getattr(ai_model, 'pricing_config', None)
    runtime_pricing = ai_model.get_runtime_pricing_schema() or {}

    if pricing_config is not None:
        mode = pricing_config.mode
    elif 'cost_params' in runtime_pricing:
        mode = 'lookup'
    else:
        mode = 'fixed'

    if mode == 'lookup':
        dimensions = runtime_pricing.get('cost_params', [])
        summary = f"Lookup pricing across {', '.join(dimensions)}" if dimensions else 'Lookup pricing'
    else:
        summary = f"Fixed cost: {runtime_pricing.get('fixed_cost', '')}".strip()

    return {
        'mode': mode,
        'summary': summary,
        'raw': runtime_pricing,
    }


def build_compiled_preview_context(ai_model: AIModel) -> dict[str, str]:
    return {
        'parameters_json': json.dumps(ai_model.get_runtime_parameters_schema(), ensure_ascii=False, indent=2),
        'pricing_json': json.dumps(ai_model.get_runtime_pricing_schema(), ensure_ascii=False, indent=2),
    }


def build_admin_workflow_context(ai_model: AIModel) -> dict[str, Any]:
    mapping_rows = build_mapping_rows(ai_model)
    param_rows = [row for row in mapping_rows if row['role'] == 'param']
    system_rows = [row for row in mapping_rows if row['role'] in SYSTEM_ROLES]
    return {
        'mapping_rows': mapping_rows,
        'pricing': build_pricing_context(ai_model),
        'compiled_preview': build_compiled_preview_context(ai_model),
        'summary': {
            'mapped_count': sum(1 for row in param_rows if row['status'] == 'mapped'),
            'needs_attention_count': sum(1 for row in mapping_rows if row['status'] == 'needs_mapping'),
            'system_count': len(system_rows),
            'placeholder_count': len(mapping_rows),
        },
    }
