from django.apps import AppConfig


class CreditsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.credits'
    verbose_name = 'Кредиты'

    def ready(self):
        import apps.credits.signals  # noqa: F401
