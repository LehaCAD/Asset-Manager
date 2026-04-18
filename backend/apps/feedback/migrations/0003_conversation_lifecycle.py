from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('feedback', '0002_message_edited_deleted'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # 1. OneToOneField → ForeignKey (removes unique constraint, keeps data)
        migrations.AlterField(
            model_name='conversation',
            name='user',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='feedback_conversations',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        # 2. Add STATUS_CLOSED to status choices
        migrations.AlterField(
            model_name='conversation',
            name='status',
            field=models.CharField(
                choices=[('open', 'Открыт'), ('resolved', 'Решён'), ('closed', 'Закрыт')],
                default='open',
                max_length=20,
            ),
        ),
    ]
