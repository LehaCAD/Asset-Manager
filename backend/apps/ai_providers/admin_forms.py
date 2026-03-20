import json

from django import forms

from .admin_workflow import FIELD_TYPE_PRESETS, SYSTEM_ROLES, UI_SEMANTIC_PRESETS, discover_placeholder_entries
from .models import AIModel, CanonicalParameter, ModelParameterBinding, ModelPricingConfig
from .pricing_tools import build_pricing_template_for_model, parse_bulk_pricing_json
from django.core.exceptions import ValidationError as DjangoValidationError

from .validators import validate_model_admin_config


class AIModelAdminForm(forms.ModelForm):
    mapping_payload = forms.CharField(required=False, widget=forms.HiddenInput())
    pricing_mode = forms.CharField(required=False)
    pricing_fixed_cost = forms.CharField(required=False)
    pricing_dimensions = forms.CharField(required=False)
    pricing_bulk_json = forms.CharField(required=False, widget=forms.HiddenInput())
    image_inputs_payload = forms.CharField(required=False, widget=forms.HiddenInput())

    class Meta:
        model = AIModel
        fields = '__all__'
        widgets = {
            'description': forms.Textarea(attrs={'rows': 3}),
            'request_schema': forms.Textarea(attrs={
                'rows': 14,
                'style': 'font-family: "JetBrains Mono", "Fira Code", monospace; font-size: 13px; line-height: 1.6;',
            }),
            'parameters_schema': forms.Textarea(attrs={
                'rows': 8,
                'style': 'font-family: "JetBrains Mono", "Fira Code", monospace; font-size: 12px; line-height: 1.5;',
            }),
            'pricing_schema': forms.Textarea(attrs={
                'rows': 6,
                'style': 'font-family: "JetBrains Mono", "Fira Code", monospace; font-size: 12px; line-height: 1.5;',
            }),
            'image_inputs_schema': forms.Textarea(attrs={
                'rows': 6,
                'style': 'font-family: "JetBrains Mono", "Fira Code", monospace; font-size: 12px; line-height: 1.5;',
            }),
            'tags': forms.Textarea(attrs={
                'rows': 3,
                'style': 'font-family: "JetBrains Mono", "Fira Code", monospace; font-size: 12px;',
                'placeholder': '["Tag 1", "Tag 2"]',
            }),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['pricing_schema'].required = False

    def _parse_mapping_payload(self, raw_payload):
        if not raw_payload:
            return []

        if isinstance(raw_payload, list):
            payload = raw_payload
        else:
            payload = json.loads(raw_payload)

        if not isinstance(payload, list):
            raise ValueError('Mapping payload must be a JSON array.')
        return payload

    def _resolve_canonical_parameter_from_row(self, row):
        canonical_code = row.get('canonical_code') or row.get('parameter_code') or row.get('placeholder')
        field_type = row.get('field_type') or 'text'
        field_preset = FIELD_TYPE_PRESETS.get(field_type, FIELD_TYPE_PRESETS['text'])
        ui_semantic = field_preset['ui_semantic']
        preset = UI_SEMANTIC_PRESETS.get(ui_semantic, UI_SEMANTIC_PRESETS['text'])
        parameter, created = CanonicalParameter.objects.get_or_create(
            code=canonical_code,
            defaults={
                'ui_semantic': ui_semantic,
                'value_type': preset['value_type'],
                'default_ui_control': preset['default_ui_control'],
                'aliases': [],
            },
        )
        if created:
            placeholder = row.get('placeholder')
            if placeholder and placeholder != canonical_code:
                parameter.aliases = [placeholder]
                parameter.save(update_fields=['aliases'])
        else:
            fields_to_update = []
            # Only update default_ui_control from field_type; preserve ui_semantic
            desired_control = field_preset['default_ui_control']
            if parameter.default_ui_control != desired_control:
                parameter.default_ui_control = desired_control
                fields_to_update.append('default_ui_control')
            aliases = parameter.aliases or []
            placeholder = row.get('placeholder')
            if placeholder and placeholder != canonical_code and placeholder not in aliases:
                parameter.aliases = [*aliases, placeholder]
                fields_to_update.append('aliases')
            if fields_to_update:
                parameter.save(update_fields=fields_to_update)
        return parameter

    def _parse_pricing_dimensions(self, raw_dimensions):
        if not raw_dimensions:
            return []
        if isinstance(raw_dimensions, list):
            dimensions = raw_dimensions
        else:
            dimensions = json.loads(raw_dimensions)
        if not isinstance(dimensions, list):
            raise ValueError('Pricing dimensions must be a JSON array.')
        return dimensions

    def _build_bound_dimension_values(self, mapping_rows):
        bound_values = {}
        rows_by_placeholder = {
            row.get('placeholder'): row
            for row in mapping_rows
            if row.get('placeholder') and (row.get('canonical_code') or row.get('parameter_code'))
        }

        for row in mapping_rows:
            if row.get('role', 'param') != 'param':
                continue
            canonical_code = row.get('canonical_code') or row.get('parameter_code')
            if not canonical_code:
                continue
            canonical = CanonicalParameter.objects.filter(code=canonical_code).first()
            if canonical is None:
                field_type = row.get('field_type') or 'text'
                field_preset = FIELD_TYPE_PRESETS.get(field_type, FIELD_TYPE_PRESETS['text'])
                ui_semantic = field_preset['ui_semantic']
                preset = UI_SEMANTIC_PRESETS.get(ui_semantic, UI_SEMANTIC_PRESETS['text'])
                canonical = CanonicalParameter(
                    code=canonical_code,
                    ui_semantic=ui_semantic,
                    value_type=preset['value_type'],
                    default_ui_control=preset['default_ui_control'],
                    aliases=[],
                )
                continue
            options = row.get('options_override') or canonical.base_options or []
            bound_values[canonical.code] = [
                option.get('value')
                for option in options
                if isinstance(option, dict) and 'value' in option
            ]

        if not getattr(self.instance, 'pk', None):
            return bound_values

        for binding in self.instance.parameter_bindings.select_related('canonical_parameter').all():
            if binding.placeholder in rows_by_placeholder:
                continue
            options = binding.options_override or binding.canonical_parameter.base_options or []
            bound_values[binding.canonical_parameter.code] = [
                option.get('value')
                for option in options
                if isinstance(option, dict) and 'value' in option
            ]

        return bound_values

    def clean(self):
        cleaned_data = super().clean()
        if self.errors:
            return cleaned_data

        json_defaults = {
            'parameters_schema': [],
            'image_inputs_schema': [],
            'pricing_schema': {},
            'tags': [],
        }
        for field_name, default in json_defaults.items():
            if cleaned_data.get(field_name) is None:
                cleaned_data[field_name] = default

        instance = self.instance
        for field_name, value in cleaned_data.items():
            setattr(instance, field_name, value)

        # ── Validate image_inputs_schema ──
        from .validators import validate_image_inputs_schema
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

        raw_payload = cleaned_data.get('mapping_payload', '[]')
        try:
            mapping_rows = self._parse_mapping_payload(raw_payload)
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            self.add_error('mapping_payload', str(exc))
            return cleaned_data

        self._mapping_rows = mapping_rows

        if mapping_rows:
            discovered_paths = {
                entry['placeholder']: entry['request_path']
                for entry in discover_placeholder_entries(instance.request_schema)
            }
            system_placeholders_from_payload = set()

            for row in mapping_rows:
                role = row.get('role', 'param')
                placeholder = row.get('placeholder')
                if role in SYSTEM_ROLES:
                    system_placeholders_from_payload.add(placeholder)
                    continue
                canonical_code = row.get('canonical_code') or row.get('parameter_code')
                if not canonical_code:
                    self.add_error('mapping_payload', f'Missing parameter code for placeholder {placeholder}.')
                if placeholder and not row.get('request_path'):
                    row['request_path'] = discovered_paths.get(placeholder, '')

            payload_placeholders = {
                row.get('placeholder')
                for row in mapping_rows
                if row.get('placeholder')
            }
            unresolved = []
            for entry in discover_placeholder_entries(instance.request_schema):
                placeholder = entry['placeholder']
                if placeholder not in payload_placeholders:
                    unresolved.append(placeholder)

            if unresolved:
                self.add_error(
                    'request_schema',
                    f'Unresolved placeholders: {", ".join(unresolved)}.',
                )
        else:
            if getattr(instance, 'pk', None):
                try:
                    validate_model_admin_config(instance)
                except ValueError as exc:
                    self.add_error('request_schema', str(exc))
        try:
            pricing_dimensions = self._parse_pricing_dimensions(cleaned_data.get('pricing_dimensions', '[]'))
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            self.add_error('pricing_dimensions', str(exc))
            pricing_dimensions = []

        pricing_mode = cleaned_data.get('pricing_mode') or 'fixed'
        bound_values = self._build_bound_dimension_values(mapping_rows)
        bound_codes = set(bound_values.keys())

        for dimension in pricing_dimensions:
            if dimension not in bound_codes:
                self.add_error('pricing_dimensions', f'Pricing dimension "{dimension}" is not bound to this model.')

        self._pricing_mode = pricing_mode
        self._pricing_dimensions = pricing_dimensions
        self._pricing_payload = None

        if pricing_mode == 'fixed':
            fixed_cost = cleaned_data.get('pricing_fixed_cost') or ''
            self._pricing_payload = {'fixed_cost': fixed_cost}
        elif pricing_mode in {'lookup', 'bulk_json'}:
            raw_pricing_json = cleaned_data.get('pricing_bulk_json') or ''
            try:
                self._pricing_payload = parse_bulk_pricing_json(
                    raw_pricing_json,
                    dimensions=pricing_dimensions,
                    allowed_values=bound_values,
                )
            except (ValueError, TypeError, json.JSONDecodeError) as exc:
                self.add_error('pricing_bulk_json', str(exc))
        elif pricing_mode == 'generate_template':
            try:
                temp_model = instance
                self._pricing_payload = build_pricing_template_for_model(temp_model, pricing_dimensions)
            except ValueError as exc:
                self.add_error('pricing_dimensions', str(exc))

        pricing_schema = cleaned_data.get('pricing_schema') or {}
        if isinstance(pricing_schema, dict) and pricing_schema.get('cost_params') and pricing_schema.get('costs'):
            dimensions = pricing_schema.get('cost_params', [])
            allowed_values = {}
            if getattr(instance, 'pk', None):
                for binding in instance.parameter_bindings.select_related('canonical_parameter').all():
                    code = binding.canonical_parameter.code
                    options = binding.options_override or binding.canonical_parameter.base_options or []
                    if code in dimensions and options:
                        allowed_values[code] = [option.get('value') for option in options if isinstance(option, dict) and 'value' in option]
            try:
                parse_bulk_pricing_json(
                    str(pricing_schema).replace("'", '"'),
                    dimensions=dimensions,
                    allowed_values=allowed_values,
                )
            except (ValueError, TypeError) as exc:
                self.add_error('pricing_schema', str(exc))
        return cleaned_data

    def save(self, commit=True):
        instance = super().save(commit=commit)
        return instance

    def _save_mapping_rows(self, instance, mapping_rows):
        discovered_paths = {
            entry['placeholder']: entry['request_path']
            for entry in discover_placeholder_entries(instance.request_schema)
        }
        existing_bindings = {
            binding.placeholder: binding
            for binding in instance.parameter_bindings.select_related('canonical_parameter').all()
        }
        desired_placeholders = set()

        for index, row in enumerate(mapping_rows):
            placeholder = row['placeholder']
            role = row.get('role', 'param')
            desired_placeholders.add(placeholder)
            binding = existing_bindings.get(placeholder)
            canonical_parameter = self._resolve_canonical_parameter_from_row(row)
            if binding is None:
                binding = ModelParameterBinding(
                    ai_model=instance,
                    placeholder=placeholder,
                )

            binding.canonical_parameter = canonical_parameter
            binding.request_path = row.get('request_path') or discovered_paths.get(placeholder, '')
            if 'display_label' in row:
                binding.label_override = row['display_label']
            elif 'label_override' in row:
                binding.label_override = row['label_override']
            if 'default_override' in row:
                binding.default_override = row['default_override']
            if 'options_override' in row:
                binding.options_override = row['options_override']

            field_type = row.get('field_type') or 'text'
            field_preset = FIELD_TYPE_PRESETS.get(field_type, FIELD_TYPE_PRESETS['text'])
            binding.ui_control_override = field_preset['default_ui_control'] if role == 'param' else ''

            binding.is_visible = role == 'param'
            binding.is_advanced = role == 'hidden'
            binding.sort_order = row.get('sort_order', binding.sort_order or (index + 1) * 10)
            binding.save()

        if desired_placeholders:
            instance.parameter_bindings.exclude(placeholder__in=desired_placeholders).delete()

    def _save_pricing_config(self, instance):
        pricing_mode = self._pricing_mode or 'fixed'
        payload = self._pricing_payload or {}

        pricing_config, _created = ModelPricingConfig.objects.get_or_create(ai_model=instance)
        if pricing_mode == 'fixed':
            pricing_config.mode = ModelPricingConfig.MODE_FIXED
            pricing_config.dimensions = []
            pricing_config.raw_lookup = {}
            pricing_config.compiled_payload = payload
        else:
            pricing_config.mode = ModelPricingConfig.MODE_LOOKUP
            pricing_config.dimensions = self._pricing_dimensions
            pricing_config.raw_lookup = payload.get('costs', {})
            pricing_config.compiled_payload = {}
        pricing_config.save()

        instance.pricing_schema = payload
        instance.save(update_fields=['pricing_schema'])
