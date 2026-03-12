from django import forms

from .models import AIModel
from .pricing_tools import parse_bulk_pricing_json
from .validators import validate_model_admin_config


class AIModelAdminForm(forms.ModelForm):
    class Meta:
        model = AIModel
        fields = '__all__'

    def clean(self):
        cleaned_data = super().clean()
        if self.errors:
            return cleaned_data

        instance = self.instance
        for field_name, value in cleaned_data.items():
            setattr(instance, field_name, value)

        try:
            validate_model_admin_config(instance)
        except ValueError as exc:
            self.add_error('request_schema', str(exc))

        pricing_schema = cleaned_data.get('pricing_schema') or {}
        if isinstance(pricing_schema, dict) and pricing_schema.get('cost_params') and pricing_schema.get('costs'):
            dimensions = pricing_schema.get('cost_params', [])
            allowed_values = {}
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
