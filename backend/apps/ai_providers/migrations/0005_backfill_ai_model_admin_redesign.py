from django.db import migrations


def backfill_ai_models(apps, schema_editor):
    AIModel = apps.get_model('ai_providers', 'AIModel')
    CanonicalParameter = apps.get_model('ai_providers', 'CanonicalParameter')
    ModelParameterBinding = apps.get_model('ai_providers', 'ModelParameterBinding')
    ModelPricingConfig = apps.get_model('ai_providers', 'ModelPricingConfig')

    for ai_model in AIModel.objects.all():
        legacy_schema = ai_model.parameters_schema if isinstance(ai_model.parameters_schema, dict) else {}

        for index, (request_key, config) in enumerate(legacy_schema.items()):
            config = config or {}
            parameter, _created = CanonicalParameter.objects.get_or_create(
                code=request_key,
                defaults={
                    'ui_semantic': request_key,
                    'value_type': 'enum' if config.get('options') else 'string',
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
                    'mode': 'fixed',
                    'dimensions': [],
                    'raw_lookup': {},
                    'compiled_payload': pricing_schema,
                },
            )
        elif 'cost_params' in pricing_schema and 'costs' in pricing_schema:
            ModelPricingConfig.objects.update_or_create(
                ai_model=ai_model,
                defaults={
                    'mode': 'lookup',
                    'dimensions': pricing_schema.get('cost_params', []),
                    'raw_lookup': pricing_schema.get('costs', {}),
                    'compiled_payload': pricing_schema,
                },
            )


class Migration(migrations.Migration):
    dependencies = [
        ('ai_providers', '0004_ai_model_admin_redesign_core'),
    ]

    operations = [
        migrations.RunPython(backfill_ai_models, migrations.RunPython.noop),
    ]
