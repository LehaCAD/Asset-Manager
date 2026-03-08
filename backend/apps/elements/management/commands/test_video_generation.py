"""
Management command для генерации видео из изображения через Kie.ai Seedance.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.core.files import File
from apps.projects.models import Project
from apps.scenes.models import Scene
from apps.elements.models import Element
from apps.ai_providers.models import AIModel
from apps.elements.tasks import start_generation
from apps.scenes.s3_utils import upload_file_to_s3

User = get_user_model()


class Command(BaseCommand):
    help = 'Генерация видео из изображения 123.jpg через Kie.ai Seedance'

    def add_arguments(self, parser):
        parser.add_argument(
            '--username',
            type=str,
            default='admin',
            help='Username пользователя (default: admin)'
        )

    def handle(self, *args, **options):
        username = options['username']
        
        self.stdout.write(self.style.SUCCESS('=' * 70))
        self.stdout.write(self.style.SUCCESS('🎬 Генерация видео через Kie.ai Seedance 1.5 Pro'))
        self.stdout.write(self.style.SUCCESS('=' * 70))
        
        # Найти пользователя
        try:
            user = User.objects.get(username=username)
            self.stdout.write(f'✅ Пользователь: {user.username}')
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'❌ Пользователь {username} не найден!'))
            return
        
        # Найти или создать проект
        project, _ = Project.objects.get_or_create(
            user=user,
            name='Test Video Generation',
            defaults={'name': 'Test Video Generation'}
        )
        self.stdout.write(f'✅ Проект: {project.name}')
        
        # Найти или создать сцену
        scene, _ = Scene.objects.get_or_create(
            project=project,
            name='Test Video Scene',
            defaults={'name': 'Test Video Scene', 'order_index': 0}
        )
        self.stdout.write(f'✅ Сцена: {scene.name}')
        
        # Загрузить 123.jpg на S3
        self.stdout.write('\n📤 Загрузка 123.jpg на S3...')
        try:
            with open('123.jpg', 'rb') as f:
                from django.core.files.uploadedfile import InMemoryUploadedFile
                from io import BytesIO
                
                file_content = f.read()
                file_obj = BytesIO(file_content)
                
                # Загружаем на S3
                from django.core.files.storage import default_storage
                from django.core.files.base import ContentFile
                
                file_path = 'test_images/123.jpg'
                saved_path = default_storage.save(file_path, ContentFile(file_content))
                image_url = default_storage.url(saved_path)
                
                self.stdout.write(self.style.SUCCESS(f'✅ Изображение загружено: {image_url}'))
                
                # Создать элемент с исходным изображением (для проверки URL)
                source_element = Element.objects.create(
                    scene=scene,
                    element_type=Element.ELEMENT_TYPE_IMAGE,
                    file_url=image_url,
                    prompt_text='Source image for video generation',
                    status=Element.STATUS_COMPLETED,
                    source_type=Element.SOURCE_UPLOADED
                )
                self.stdout.write(f'✅ Создан source Element #{source_element.id}')
                
        except FileNotFoundError:
            self.stdout.write(self.style.ERROR('❌ Файл 123.jpg не найден!'))
            return
        
        # Найти AI модель Seedance
        try:
            ai_model = AIModel.objects.filter(
                name__icontains='Seedance',
                model_type=AIModel.MODEL_TYPE_VIDEO,
                is_active=True
            ).first()
            
            if not ai_model:
                raise AIModel.DoesNotExist
            
            self.stdout.write(f'✅ AI модель: {ai_model.name} (ID: {ai_model.id})')
            self.stdout.write(f'   Model в схеме: {ai_model.request_schema.get("model", "N/A")}')
            
        except AIModel.DoesNotExist:
            self.stdout.write(self.style.ERROR('❌ Модель Seedance не найдена!'))
            return
        
        # Создание элемента для видео (input_urls в generation_config — единственный источник)
        prompt = "Two people arm wrestling in a vintage room, dynamic movement, cinematic"

        element = Element.objects.create(
            scene=scene,
            element_type=Element.ELEMENT_TYPE_VIDEO,
            prompt_text=prompt,
            ai_model=ai_model,
            generation_config={
                'aspect_ratio': '16:9',
                'resolution': '720p',
                'duration': '8',
                'input_urls': [source_element.file_url],
            },
            status=Element.STATUS_PENDING,
            source_type=Element.SOURCE_IMG2VID
        )

        self.stdout.write(f'\n✅ Создан Element для видео #{element.id}')
        self.stdout.write(f'   Промпт: {prompt}')
        self.stdout.write(f'   Source image URL: {source_element.file_url}')
        self.stdout.write(f'   Конфигурация: {element.generation_config}')
        
        # Запуск генерации
        self.stdout.write('\n🚀 Запуск генерации через Celery...')
        
        task = start_generation.delay(element.id)
        
        self.stdout.write(self.style.SUCCESS(f'\n✅ Задача отправлена в Celery!'))
        self.stdout.write(f'   Celery Task ID: {task.id}')
        self.stdout.write(f'   Element ID: {element.id}')
        
        self.stdout.write('\n' + '=' * 70)
        self.stdout.write(self.style.SUCCESS('🎬 Генерация запущена!'))
        self.stdout.write('=' * 70)
        
        self.stdout.write('\n📊 Мониторинг:')
        self.stdout.write('   docker compose logs -f celery')
        self.stdout.write('\n🔍 Проверить статус:')
        self.stdout.write(f'   Element.objects.get(id={element.id}).status')
        self.stdout.write(f'   Element.objects.get(id={element.id}).external_task_id')
        self.stdout.write('')
