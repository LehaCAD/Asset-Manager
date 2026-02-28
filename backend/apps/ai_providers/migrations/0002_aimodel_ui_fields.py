# Generated migration for Phase 0: add UI fields to AIModel

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ai_providers', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='aimodel',
            name='parameters_schema',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='Описание параметров для UI в виде списка: [{"key": "aspect_ratio", "label": "Соотношение сторон", "type": "toggle_group", "options": [...], "default": "1:1"}]',
                verbose_name='Схема параметров',
            ),
        ),
        migrations.AddField(
            model_name='aimodel',
            name='preview_url',
            field=models.URLField(
                blank=True,
                max_length=500,
                verbose_name='URL превью',
                help_text='URL превью-картинки для карточки модели в селекторе',
            ),
        ),
        migrations.AddField(
            model_name='aimodel',
            name='description',
            field=models.TextField(
                blank=True,
                verbose_name='Описание',
                help_text='Краткое описание модели для UI, например: "Высокое качество и детализация"',
            ),
        ),
        migrations.AddField(
            model_name='aimodel',
            name='tags',
            field=models.JSONField(
                blank=True,
                default=list,
                verbose_name='Теги',
                help_text='Теги-бейджи для карточки модели, например: ["Style Ref", "Content Ref", "Image Ref"]',
            ),
        ),
        migrations.AddField(
            model_name='aimodel',
            name='image_inputs_schema',
            field=models.JSONField(
                blank=True,
                default=list,
                verbose_name='Схема входных изображений',
                help_text='Описание слотов изображений для промпт-бара. '
                          'Пример: [{"key": "style_ref", "label": "Style Ref", "min": 0, "max": 4, "required": false}]',
            ),
        ),
    ]
