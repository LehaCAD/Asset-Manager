# Generated migration for seeding onboarding tasks

from django.db import migrations
from decimal import Decimal


TASKS = [
    {
        'order': 1,
        'code': 'create_project',
        'title': 'Создать первый проект',
        'description': 'Проект — папка для ваших генераций',
        'icon': 'folder-open',
        'reward': Decimal('5'),
        'category': 'onboarding',
        'trigger_type': 'backend_signal',
        'trigger_event': 'project.created',
        'empty_state_title': 'Создайте первый проект',
        'empty_state_desc': 'Проект — это папка для ваших сцен и генераций',
        'empty_state_cta': 'Создать проект',
        'empty_state_page': 'projects',
    },
    {
        'order': 2,
        'code': 'create_scene',
        'title': 'Создать группу в проекте',
        'description': 'Группы помогают организовать сцены по смыслу',
        'icon': 'layout-grid',
        'reward': Decimal('5'),
        'category': 'onboarding',
        'trigger_type': 'backend_signal',
        'trigger_event': 'scene.created',
        'empty_state_title': 'Добавьте первую группу',
        'empty_state_desc': 'Группы помогают организовать сцены по смыслу',
        'empty_state_cta': 'Создать группу',
        'empty_state_page': 'scenes',
    },
    {
        'order': 3,
        'code': 'first_generation',
        'title': 'Сгенерировать изображение',
        'description': 'Напишите промпт и нажмите «Создать» — нейросеть создаст картинку за секунды',
        'icon': 'wand-sparkles',
        'reward': Decimal('10'),
        'category': 'onboarding',
        'trigger_type': 'backend_signal',
        'trigger_event': 'element.generation_success',
        'empty_state_title': 'Сгенерируйте первое изображение',
        'empty_state_desc': 'Напишите промпт выше и нажмите «Создать»',
        'empty_state_cta': '',
        'empty_state_page': 'elements',
    },
    {
        'order': 4,
        'code': 'open_lightbox',
        'title': 'Открыть в просмотрщике',
        'description': 'Нажмите на карточку — полноэкранный просмотр с деталями генерации',
        'icon': 'maximize',
        'reward': Decimal('5'),
        'category': 'onboarding',
        'trigger_type': 'frontend_action',
        'trigger_event': '',
        'empty_state_title': '',
        'empty_state_desc': '',
        'empty_state_cta': '',
        'empty_state_page': '',
    },
    {
        'order': 5,
        'code': 'download_original',
        'title': 'Скачать оригинал',
        'description': 'Кнопка «Скачать» сохранит в полном качестве — через контекстное меню получите только сжатое превью',
        'icon': 'download',
        'reward': Decimal('5'),
        'category': 'onboarding',
        'trigger_type': 'frontend_action',
        'trigger_event': '',
        'empty_state_title': '',
        'empty_state_desc': '',
        'empty_state_cta': '',
        'empty_state_page': '',
    },
    {
        'order': 6,
        'code': 'first_upload',
        'title': 'Загрузить своё изображение',
        'description': 'Добавьте фото или референс — используйте как основу для генерации',
        'icon': 'upload',
        'reward': Decimal('5'),
        'category': 'onboarding',
        'trigger_type': 'backend_signal',
        'trigger_event': 'element.upload_success',
        'empty_state_title': '',
        'empty_state_desc': '',
        'empty_state_cta': '',
        'empty_state_page': '',
    },
    {
        'order': 7,
        'code': 'retry_generation',
        'title': 'Повторить генерацию',
        'description': 'Не устроил результат? Кнопка «Повторить» — тот же промпт, свежий результат',
        'icon': 'refresh-cw',
        'reward': Decimal('5'),
        'category': 'onboarding',
        'trigger_type': 'frontend_action',
        'trigger_event': '',
        'empty_state_title': '',
        'empty_state_desc': '',
        'empty_state_cta': '',
        'empty_state_page': '',
    },
    {
        'order': 8,
        'code': 'share_project',
        'title': 'Поделиться проектом',
        'description': 'Отправьте ссылку коллеге — он увидит проект и сможет оставить комментарий',
        'icon': 'share-2',
        'reward': Decimal('5'),
        'category': 'onboarding',
        'trigger_type': 'backend_signal',
        'trigger_event': 'sharing.link_created',
        'empty_state_title': '',
        'empty_state_desc': '',
        'empty_state_cta': '',
        'empty_state_page': '',
    },
]


def seed_tasks(apps, schema_editor):
    OnboardingTask = apps.get_model('onboarding', 'OnboardingTask')
    for data in TASKS:
        OnboardingTask.objects.create(**data)


def reverse_seed(apps, schema_editor):
    OnboardingTask = apps.get_model('onboarding', 'OnboardingTask')
    codes = [t['code'] for t in TASKS]
    OnboardingTask.objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('onboarding', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_tasks, reverse_seed),
    ]
