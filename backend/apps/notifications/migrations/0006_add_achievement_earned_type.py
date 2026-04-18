# Generated for BF-05-03

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0005_alter_notification_type'),
    ]

    operations = [
        migrations.AlterField(
            model_name='notification',
            name='type',
            field=models.CharField(choices=[
                ('comment_new', 'Новый комментарий'),
                ('reaction_new', 'Новая реакция'),
                ('review_new', 'Новое решение по ревью'),
                ('generation_completed', 'Генерация завершена'),
                ('generation_failed', 'Ошибка генерации'),
                ('upload_completed', 'Загрузка завершена'),
                ('feedback_new', 'Новое обращение'),
                ('feedback_reply', 'Ответ на обращение'),
                ('feedback_reward', 'Награда за обратную связь'),
                ('achievement_earned', 'Достижение получено'),
            ], max_length=30),
        ),
    ]
