"""
Management command для настройки Kie.ai провайдера.
"""
from django.core.management.base import BaseCommand
from apps.ai_providers.models import AIProvider, AIModel


class Command(BaseCommand):
    help = 'Настройка Kie.ai провайдера и моделей'

    def add_arguments(self, parser):
        parser.add_argument(
            '--api-key',
            type=str,
            help='API ключ для Kie.ai'
        )

    def handle(self, *args, **options):
        api_key = options.get('api_key', '')
        
        self.stdout.write(self.style.SUCCESS('=' * 60))
        self.stdout.write(self.style.SUCCESS('Настройка Kie.ai провайдера'))
        self.stdout.write(self.style.SUCCESS('=' * 60))
        
        # Создание провайдера Kie.ai
        provider, created = AIProvider.objects.get_or_create(
            name='Kie.ai',
            defaults={
                'base_url': 'https://api.kie.ai',
                'api_key': api_key,
                'is_active': True
            }
        )
        
        if created:
            self.stdout.write(self.style.SUCCESS(f'✅ Создан провайдер: {provider.name}'))
        else:
            self.stdout.write(f'ℹ️  Провайдер уже существует: {provider.name}')
            if api_key:
                provider.api_key = api_key
                provider.save()
                self.stdout.write(self.style.SUCCESS('✅ API ключ обновлен'))
        
        # Создание модели Seedance 1.5 Pro (video)
        model_seedance, created = AIModel.objects.get_or_create(
            provider=provider,
            name='Seedance 1.5 Pro',
            defaults={
                'model_type': AIModel.MODEL_TYPE_VIDEO,
                'api_endpoint': '/api/v1/jobs/createTask',
                'request_schema': {
                    "model": "bytedance/seedance-1.5-pro",
                    "input": {
                        "prompt": "{{prompt}}",
                        "input_urls": "{{input_urls}}",
                        "aspect_ratio": "{{aspect_ratio}}",
                        "resolution": "{{resolution}}",
                        "duration": "{{duration}}"
                    }
                },
                'parameters_schema': {
                    "aspect_ratio": {
                        "type": "select",
                        "options": ["16:9", "9:16", "1:1"],
                        "default": "16:9"
                    },
                    "resolution": {
                        "type": "select",
                        "options": ["720p", "1080p"],
                        "default": "720p"
                    },
                    "duration": {
                        "type": "select",
                        "options": ["5", "8", "10"],
                        "default": "8"
                    }
                },
                'is_active': True
            }
        )
        
        if created:
            self.stdout.write(self.style.SUCCESS(f'✅ Создана модель: {model_seedance.name} (VIDEO)'))
        else:
            self.stdout.write(f'ℹ️  Модель уже существует: {model_seedance.name}')
        
        # Создание модели Nano Banana (image)
        model_nano, created = AIModel.objects.get_or_create(
            provider=provider,
            name='Nano Banana',
            defaults={
                'model_type': AIModel.MODEL_TYPE_IMAGE,
                'api_endpoint': '/api/v1/jobs/createTask',
                'request_schema': {
                    "model": "kie/nano-banana",
                    "input": {
                        "prompt": "{{prompt}}",
                        "width": "{{width}}",
                        "height": "{{height}}",
                        "steps": "{{steps}}"
                    }
                },
                'parameters_schema': {
                    "width": {
                        "type": "select",
                        "options": [512, 768, 1024],
                        "default": 1024
                    },
                    "height": {
                        "type": "select",
                        "options": [512, 768, 1024],
                        "default": 768
                    },
                    "steps": {
                        "type": "slider",
                        "min": 20,
                        "max": 50,
                        "default": 30
                    }
                },
                'is_active': True
            }
        )
        
        if created:
            self.stdout.write(self.style.SUCCESS(f'✅ Создана модель: {model_nano.name} (IMAGE)'))
        else:
            self.stdout.write(f'ℹ️  Модель уже существует: {model_nano.name}')
        
        self.stdout.write('\n' + '=' * 60)
        self.stdout.write(self.style.SUCCESS('Настройка завершена!'))
        self.stdout.write('=' * 60)
        
        if not api_key:
            self.stdout.write('\n' + self.style.WARNING('⚠️  API ключ не указан!'))
            self.stdout.write('\nДобавьте API ключ одним из способов:')
            self.stdout.write('1. Через админку: http://localhost:8000/admin/ai_providers/aiprovider/')
            self.stdout.write('2. Повторно запустите команду с --api-key:')
            self.stdout.write('   python manage.py setup_kie_ai --api-key YOUR_KEY')
        else:
            self.stdout.write('\n✅ API ключ установлен!')
        
        self.stdout.write('\n📝 Теперь можно использовать генерацию:')
        self.stdout.write('   POST /api/boxes/{id}/generate/')
        self.stdout.write('\n')
