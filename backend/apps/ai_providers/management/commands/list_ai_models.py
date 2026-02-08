"""
Management command для просмотра AI моделей.
"""
from django.core.management.base import BaseCommand
from apps.ai_providers.models import AIModel, AIProvider


class Command(BaseCommand):
    help = 'Показать все AI модели и провайдеры'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('=' * 70))
        self.stdout.write(self.style.SUCCESS('AI Провайдеры и Модели'))
        self.stdout.write(self.style.SUCCESS('=' * 70))
        
        providers = AIProvider.objects.all()
        
        for provider in providers:
            status_icon = '✓' if provider.is_active else '✗'
            self.stdout.write(f'\n{status_icon} {provider.name}')
            self.stdout.write(f'   URL: {provider.base_url}')
            self.stdout.write(f'   API Key: {"***" + provider.api_key[-4:] if provider.api_key else "не установлен"}')
            
            models = AIModel.objects.filter(provider=provider)
            
            if models.exists():
                self.stdout.write(f'\n   Модели:')
                for model in models:
                    model_status = '✓' if model.is_active else '✗'
                    model_name_in_schema = model.request_schema.get('model', 'N/A')
                    self.stdout.write(f'   {model_status} [{model.id}] {model.name} ({model.get_model_type_display()})')
                    self.stdout.write(f'      Endpoint: {model.api_endpoint}')
                    self.stdout.write(f'      Model ID: {model_name_in_schema}')
            else:
                self.stdout.write('   Нет моделей')
        
        self.stdout.write('\n' + '=' * 70)
