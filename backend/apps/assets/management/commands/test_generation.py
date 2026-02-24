"""
Management command для тестовой генерации через Kie.ai.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.projects.models import Project
from apps.boxes.models import Scene
from apps.assets.models import Element
from apps.ai_providers.models import AIModel
from apps.assets.tasks import start_generation

User = get_user_model()


class Command(BaseCommand):
    help = 'Тестовая генерация изображения через Kie.ai'

    def add_arguments(self, parser):
        parser.add_argument(
            '--prompt',
            type=str,
            default='A beautiful sunset over mountains, cinematic lighting, 4k',
            help='Промпт для генерации'
        )
        parser.add_argument(
            '--username',
            type=str,
            default='admin',
            help='Username пользователя (default: admin)'
        )

    def handle(self, *args, **options):
        prompt = options['prompt']
        username = options['username']
        
        self.stdout.write(self.style.SUCCESS('=' * 70))
        self.stdout.write(self.style.SUCCESS('🎨 Тестовая генерация через Kie.ai'))
        self.stdout.write(self.style.SUCCESS('=' * 70))
        
        # Найти или создать пользователя
        try:
            user = User.objects.get(username=username)
            self.stdout.write(f'✅ Найден пользователь: {user.username}')
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'❌ Пользователь {username} не найден!'))
            self.stdout.write('\nСоздайте пользователя командой:')
            self.stdout.write('   docker compose exec backend python manage.py createsuperuser')
            return
        
        # Найти или создать тестовый проект
        project, created = Project.objects.get_or_create(
            user=user,
            name='Test Generation Project',
            defaults={'name': 'Test Generation Project'}
        )
        
        if created:
            self.stdout.write(f'✅ Создан проект: {project.name}')
        else:
            self.stdout.write(f'ℹ️  Найден проект: {project.name}')
        
        # Найти или создать тестовую сцену
        scene, created = Scene.objects.get_or_create(
            project=project,
            name='Test Scene',
            defaults={'name': 'Test Scene', 'order_index': 0}
        )
        
        if created:
            self.stdout.write(f'✅ Создана сцена: {scene.name}')
        else:
            self.stdout.write(f'ℹ️  Найдена сцена: {scene.name}')
        
        # Найти AI модель Nano Banana (для изображений)
        try:
            ai_model = AIModel.objects.get(name='Nano Banana', is_active=True)
            self.stdout.write(f'✅ Найдена AI модель: {ai_model.name}')
        except AIModel.DoesNotExist:
            self.stdout.write(self.style.ERROR('❌ AI модель Nano Banana не найдена!'))
            self.stdout.write('\nЗапустите команду настройки:')
            self.stdout.write('   docker compose exec backend python manage.py setup_kie_ai --api-key YOUR_KEY')
            return
        
        # Создание элемента
        element = Element.objects.create(
            scene=scene,
            element_type=Element.ELEMENT_TYPE_IMAGE,
            prompt_text=prompt,
            ai_model=ai_model,
            generation_config={
                'width': 1024,
                'height': 768,
                'steps': 30
            },
            status=Element.STATUS_PENDING,
            source_type=Element.SOURCE_GENERATED
        )
        
        self.stdout.write(self.style.SUCCESS(f'✅ Создан Element #{element.id}'))
        self.stdout.write(f'   Промпт: {prompt}')
        self.stdout.write(f'   Модель: {ai_model.name}')
        self.stdout.write(f'   Статус: {element.get_status_display()}')
        
        # Запуск генерации
        self.stdout.write('\n🚀 Запуск асинхронной генерации...')
        
        task = start_generation.delay(element.id)
        
        self.stdout.write(self.style.SUCCESS(f'✅ Задача отправлена в Celery!'))
        self.stdout.write(f'   Celery Task ID: {task.id}')
        self.stdout.write(f'   Element ID: {element.id}')
        
        self.stdout.write('\n' + '=' * 70)
        self.stdout.write(self.style.SUCCESS('Генерация запущена!'))
        self.stdout.write('=' * 70)
        
        self.stdout.write('\n📊 Мониторинг:')
        self.stdout.write('   • Логи Celery: docker compose logs -f celery')
        self.stdout.write('   • Статус Element: django shell → Element.objects.get(id=' + str(element.id) + ')')
        self.stdout.write('\n🌐 Проверить на Kie.ai:')
        self.stdout.write('   https://api.kie.ai/dashboard (если есть UI)')
        self.stdout.write('')
