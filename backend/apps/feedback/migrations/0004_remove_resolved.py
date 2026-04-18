from django.db import migrations, models


def convert_resolved_to_closed(apps, schema_editor):
    Conversation = apps.get_model('feedback', 'Conversation')
    Conversation.objects.filter(status='resolved').update(status='closed')


class Migration(migrations.Migration):

    dependencies = [
        ('feedback', '0003_conversation_lifecycle'),
    ]

    operations = [
        migrations.RunPython(convert_resolved_to_closed, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='conversation',
            name='status',
            field=models.CharField(
                choices=[('open', 'Открыт'), ('closed', 'Закрыт')],
                default='open',
                max_length=20,
            ),
        ),
    ]
