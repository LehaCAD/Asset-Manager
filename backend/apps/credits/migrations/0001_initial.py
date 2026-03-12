# Generated manually for credits app

from decimal import Decimal
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('elements', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='CreditsTransaction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=2, max_digits=12, verbose_name='Сумма')),
                ('balance_after', models.DecimalField(decimal_places=2, max_digits=12, verbose_name='Баланс после')),
                ('reason', models.CharField(choices=[('admin_topup', 'Пополнение администратором'), ('admin_adjustment', 'Корректировка администратором'), ('generation_debit', 'Списание за генерацию'), ('generation_refund', 'Возврат за генерацию'), ('refund_provider_error', 'Возврат: ошибка провайдера'), ('refund_pricing_failure', 'Возврат: ошибка ценообразования')], max_length=64, verbose_name='Причина')),
                ('metadata', models.JSONField(blank=True, default=dict, verbose_name='Метаданные')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')),
                ('element', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='credits_transactions', to='elements.element', verbose_name='Элемент')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='credits_transactions', to=settings.AUTH_USER_MODEL, verbose_name='Пользователь')),
            ],
            options={
                'verbose_name': 'Транзакция кредитов',
                'verbose_name_plural': 'Транзакции кредитов',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='creditstransaction',
            index=models.Index(fields=['user', '-created_at'], name='credits_cre_user_id_550459_idx'),
        ),
        migrations.AddIndex(
            model_name='creditstransaction',
            index=models.Index(fields=['element', 'reason'], name='credits_cre_element_20ca77_idx'),
        ),
    ]
