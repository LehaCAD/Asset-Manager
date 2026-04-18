# Data migration: add two new onboarding achievements —
#   first_support_chat (write to support) and first_batch_download (batch download)

from decimal import Decimal
from django.db import migrations


NEW_TASKS = [
    {
        "order": 9,
        "code": "first_support_chat",
        "title": "Связаться с поддержкой",
        "description": "Напишите нам о проблеме, идее или замечании — будем благодарны",
        "icon": "life-buoy",
        "reward": Decimal("5"),
        "category": "onboarding",
        "trigger_type": "backend_signal",
        "trigger_event": "feedback.first_message",
        "empty_state_title": "",
        "empty_state_desc": "",
        "empty_state_cta": "",
        "empty_state_page": "",
        "is_active": True,
    },
    {
        "order": 10,
        "code": "first_batch_download",
        "title": "Массовое скачивание",
        "description": "Скачайте всю подборку одним архивом — не возитесь с каждым файлом",
        "icon": "archive",
        "reward": Decimal("5"),
        "category": "onboarding",
        "trigger_type": "backend_signal",
        "trigger_event": "element.batch_download",
        "empty_state_title": "",
        "empty_state_desc": "",
        "empty_state_cta": "",
        "empty_state_page": "",
        "is_active": True,
    },
]


def add_tasks(apps, schema_editor):
    OnboardingTask = apps.get_model("onboarding", "OnboardingTask")
    for data in NEW_TASKS:
        OnboardingTask.objects.update_or_create(
            code=data["code"], defaults=data,
        )


def remove_tasks(apps, schema_editor):
    OnboardingTask = apps.get_model("onboarding", "OnboardingTask")
    OnboardingTask.objects.filter(
        code__in=[t["code"] for t in NEW_TASKS],
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("onboarding", "0004_update_create_project_icon"),
    ]

    operations = [
        migrations.RunPython(add_tasks, remove_tasks),
    ]
