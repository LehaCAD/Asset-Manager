# Generated manually

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('assets', '0001_initial'),
        ('boxes', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='box',
            name='headliner',
            field=models.ForeignKey(
                blank=True,
                help_text='Главный ассет — обложка бокса на сценарном столе',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='headliner_for_box',
                to='assets.asset',
                verbose_name='Хедлайнер',
            ),
        ),
    ]
