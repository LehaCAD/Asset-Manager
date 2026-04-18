# Data migration: change create_project icon from folder-open to folder-plus

from django.db import migrations


def forwards(apps, schema_editor):
    OnboardingTask = apps.get_model("onboarding", "OnboardingTask")
    OnboardingTask.objects.filter(code="create_project").update(icon="folder-plus")


def backwards(apps, schema_editor):
    OnboardingTask = apps.get_model("onboarding", "OnboardingTask")
    OnboardingTask.objects.filter(code="create_project").update(icon="folder-open")


class Migration(migrations.Migration):

    dependencies = [
        ("onboarding", "0003_update_task_texts"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
