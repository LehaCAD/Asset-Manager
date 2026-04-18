# Data migration: update task titles and descriptions to achievement style

from django.db import migrations


UPDATES = {
    'create_project': {
        'title': 'Первый проект',
        'description': 'Создайте пространство для своих идей — проект объединяет генерации, загрузки и группы',
    },
    'create_scene': {
        'title': 'Первая группа',
        'description': 'Организуйте материалы по смыслу — группы помогают структурировать работу внутри проекта',
    },
    'first_generation': {
        'title': 'Первая генерация',
        'description': 'Опишите задумку текстом — нейросеть создаст изображение за считанные секунды',
    },
    'open_lightbox': {
        'title': 'Детальный просмотр',
        'description': 'Нажмите на карточку — полноэкранный режим с параметрами генерации и историей промптов',
    },
    'download_original': {
        'title': 'Первое скачивание',
        'description': 'Сохраните результат в полном качестве — кнопка «Скачать» отдаёт оригинал без сжатия',
    },
    'first_upload': {
        'title': 'Свой материал',
        'description': 'Загрузите фото или референс — используйте как основу для генерации или сравнения',
    },
    'retry_generation': {
        'title': 'Повторная генерация',
        'description': 'Не подошёл результат? Нажмите «Повторить» — те же настройки, свежий вариант',
    },
    'share_project': {
        'title': 'Общий доступ',
        'description': 'Отправьте ссылку коллеге — он увидит проект и сможет оставить комментарий',
    },
}


def update_tasks(apps, schema_editor):
    OnboardingTask = apps.get_model('onboarding', 'OnboardingTask')
    for code, fields in UPDATES.items():
        OnboardingTask.objects.filter(code=code).update(**fields)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('onboarding', '0002_seed_onboarding_tasks'),
    ]

    operations = [
        migrations.RunPython(update_tasks, noop),
    ]
