from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ai_providers', '0010_modelfamily_aimodel_is_default_variant_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='aimodel',
            name='preview_image',
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to='system/model-previews/',
                verbose_name='Превью (файл)',
                help_text=(
                    'Загрузите изображение — оно сохранится в S3 и будет использоваться как превью. '
                    'Имеет приоритет над URL превью.'
                ),
            ),
        ),
        migrations.AlterField(
            model_name='aimodel',
            name='preview_url',
            field=models.CharField(
                blank=True,
                max_length=500,
                verbose_name='URL превью (внешний)',
                help_text='Используется, только если файл не загружен. Внешний URL, начинающийся с https://...',
            ),
        ),
    ]
