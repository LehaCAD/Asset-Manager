from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ai_providers', '0012_migrate_model_previews_to_s3'),
    ]

    operations = [
        migrations.AlterField(
            model_name='aimodel',
            name='variant_sort_order',
            field=models.PositiveIntegerField(
                default=0,
                blank=True,
                verbose_name='Порядок варианта',
                help_text='Порядок в переключателе вариантов',
            ),
        ),
    ]
