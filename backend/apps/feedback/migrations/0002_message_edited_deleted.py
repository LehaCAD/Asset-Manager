from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('feedback', '0001_initial'),
    ]
    operations = [
        migrations.AddField(
            model_name='message',
            name='edited_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='message',
            name='is_deleted',
            field=models.BooleanField(default=False),
        ),
    ]
