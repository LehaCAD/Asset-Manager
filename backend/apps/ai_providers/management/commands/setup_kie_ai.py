"""
Management command for creating the Kie.ai provider and default AI models.
"""
from django.core.management.base import BaseCommand

from apps.ai_providers.backfill import backfill_ai_model
from apps.ai_providers.models import AIProvider, AIModel


SEEDANCE_REQUEST_SCHEMA = {
    "model": "bytedance/seedance-1.5-pro",
    "input": {
        "prompt": "{{prompt}}",
        "input_urls": "{{input_urls}}",
        "aspect_ratio": "{{aspect_ratio}}",
        "resolution": "{{resolution}}",
        "duration": "{{duration}}",
    },
}

SEEDANCE_PARAMETERS_SCHEMA = {
    "aspect_ratio": {"type": "select", "options": ["16:9", "9:16", "1:1"], "default": "16:9"},
    "resolution": {"type": "select", "options": ["720p", "1080p"], "default": "720p"},
    "duration": {"type": "select", "options": [5, 8, 10], "default": 8},
}

NANO_REQUEST_SCHEMA = {
    "model": "kie/nano-banana",
    "input": {
        "prompt": "{{prompt}}",
        "width": "{{width}}",
        "height": "{{height}}",
        "steps": "{{steps}}",
    },
}

NANO_PARAMETERS_SCHEMA = {
    "width": {"type": "select", "options": [512, 768, 1024], "default": 1024},
    "height": {"type": "select", "options": [512, 768, 1024], "default": 768},
    "steps": {"type": "slider", "min": 20, "max": 50, "default": 30},
}


class Command(BaseCommand):
    help = 'Create or update Kie.ai provider and default models.'

    def add_arguments(self, parser):
        parser.add_argument('--api-key', type=str, help='API key for Kie.ai')

    def handle(self, *args, **options):
        api_key = options.get('api_key') or ''

        provider, _created = AIProvider.objects.get_or_create(
            name='Kie.ai',
            defaults={'base_url': 'https://api.kie.ai', 'api_key': api_key, 'is_active': True},
        )
        if api_key:
            provider.api_key = api_key
            provider.is_active = True
            provider.save(update_fields=['api_key', 'is_active', 'updated_at'])

        models_to_seed = [
            (
                'Seedance 1.5 Pro',
                {
                    'model_type': AIModel.MODEL_TYPE_VIDEO,
                    'api_endpoint': '/api/v1/jobs/createTask',
                    'request_schema': SEEDANCE_REQUEST_SCHEMA,
                    'parameters_schema': SEEDANCE_PARAMETERS_SCHEMA,
                    'pricing_schema': {'fixed_cost': '8.00'},
                    'is_active': True,
                },
            ),
            (
                'Nano Banana',
                {
                    'model_type': AIModel.MODEL_TYPE_IMAGE,
                    'api_endpoint': '/api/v1/jobs/createTask',
                    'request_schema': NANO_REQUEST_SCHEMA,
                    'parameters_schema': NANO_PARAMETERS_SCHEMA,
                    'pricing_schema': {'fixed_cost': '5.00'},
                    'is_active': True,
                },
            ),
        ]

        for name, defaults in models_to_seed:
            model, _created = AIModel.objects.get_or_create(provider=provider, name=name, defaults=defaults)
            if not _created:
                for field_name, value in defaults.items():
                    setattr(model, field_name, value)
                model.save()
            backfill_ai_model(model)

        self.stdout.write(self.style.SUCCESS('Kie.ai provider and AI models are configured.'))
