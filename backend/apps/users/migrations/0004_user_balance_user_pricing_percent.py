# Generated manually for credits fields

from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0003_ensure_userquota_column_names'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='balance',
            field=models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=12, verbose_name='Баланс'),
        ),
        migrations.AddField(
            model_name='user',
            name='pricing_percent',
            field=models.PositiveIntegerField(default=100, help_text='100 = по себестоимости, 80 = скидка 20%, 130 = наценка 30%', verbose_name='Процент цены'),
        ),
    ]
