# Generated manually for credits fields

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ai_providers', '0002_aimodel_ui_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='aimodel',
            name='pricing_schema',
            field=models.JSONField(default=dict, help_text='Либо {"fixed_cost": "5.00"}, либо {"cost_params": ["resolution", "duration"], "costs": {"720p|5": "3.00"}}', verbose_name='Схема ценообразования'),
        ),
    ]
