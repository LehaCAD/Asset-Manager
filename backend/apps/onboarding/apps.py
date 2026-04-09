from django.apps import AppConfig

class OnboardingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.onboarding'
    verbose_name = 'Онбординг и задания'

    def ready(self):
        import apps.onboarding.signals  # noqa: F401
