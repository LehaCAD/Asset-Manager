"""
Воспроизведение ошибки Credits insufficient: mock requests.post, запуск генерации, проверка, откат.
"""
from unittest.mock import patch, MagicMock

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction

from apps.projects.models import Project
from apps.scenes.models import Scene
from apps.elements.models import Element
from apps.ai_providers.models import AIProvider, AIModel
from apps.elements.tasks import start_generation

User = get_user_model()


def _mock_post_credits_error(*args, **kwargs):
    """Имитирует ответ провайдера: code 500, Credits insufficient."""
    resp = MagicMock()
    resp.status_code = 200
    resp.raise_for_status = lambda: None
    resp.json.return_value = {"code": 500, "msg": "Credits insufficient"}
    return resp


class Command(BaseCommand):
    help = "Воспроизвести ошибку Credits insufficient и откатить изменения"

    def handle(self, *args, **options):
        original_base_url = None
        provider = None

        try:
            # 1. Сохранить и подменить base_url (чтобы URL был валидным)
            provider = AIProvider.objects.filter(models__is_active=True).first()
            if not provider:
                self.stdout.write(self.style.ERROR("Нет провайдера с активными моделями"))
                return

            original_base_url = provider.base_url
            provider.base_url = "http://127.0.0.1:9999"
            provider.save()
            self.stdout.write(f"Провайдер {provider.name}: base_url -> mock")

            # 2. Создать элемент
            user = User.objects.filter(is_superuser=True).first() or User.objects.first()
            if not user:
                self.stdout.write(self.style.ERROR("Нет пользователя"))
                return

            project = Project.objects.filter(user=user).first()
            if not project:
                project = Project.objects.create(user=user, name="Test Credits")
            scene = Scene.objects.filter(project=project).first()
            if not scene:
                scene = Scene.objects.create(project=project, name="Test", order_index=0)

            ai_model = AIModel.objects.filter(
                provider=provider, is_active=True, model_type=Element.ELEMENT_TYPE_IMAGE
            ).first() or AIModel.objects.filter(provider=provider, is_active=True).first()
            if not ai_model:
                self.stdout.write(self.style.ERROR(f"Нет активной модели у {provider.name}"))
                return

            schema = ai_model.get_runtime_parameters_schema()
            defaults = {}
            if isinstance(schema, list):
                for p in schema:
                    key = p.get("request_key") or p.get("parameter_code")
                    if key and "default" in p:
                        defaults[key] = p["default"]
            elif isinstance(schema, dict):
                defaults = {k: v.get("default") for k, v in schema.items() if isinstance(v, dict) and "default" in v}
            if not defaults:
                defaults = {"width": 512, "height": 512, "steps": 30, "resolution": "720p", "aspect_ratio": "16:9", "duration": 8}
            defaults["_debit_amount"] = "0.01"
            defaults["_debit_transaction"] = True
            if "input_urls" not in defaults:
                defaults["input_urls"] = []

            with transaction.atomic():
                element = Element.objects.create(
                    scene=scene,
                    element_type=ai_model.model_type,
                    prompt_text="test",
                    ai_model=ai_model,
                    generation_config=defaults,
                    status=Element.STATUS_PENDING,
                    source_type=Element.SOURCE_GENERATED,
                )

            self.stdout.write(f"Element #{element.id} создан, запуск start_generation (mock)...")
            with (
                patch("apps.elements.tasks.requests.post", side_effect=_mock_post_credits_error),
                patch("apps.elements.tasks.validate_model_admin_config"),
            ):
                start_generation.apply(args=[element.id])

            # 3. Проверка
            element.refresh_from_db()
            if element.status == Element.STATUS_FAILED:
                has_credits = "credits" in (element.error_message or "").lower() or "недостаточно" in (element.error_message or "").lower()
                self.stdout.write(self.style.SUCCESS(f"OK: элемент #{element.id} -> FAILED"))
                self.stdout.write(f"   error_message: {element.error_message[:80]}...")
                if has_credits:
                    self.stdout.write(self.style.SUCCESS("   (содержит credits/недостаточно — фронт удалит карточку)"))
            else:
                self.stdout.write(self.style.WARNING(f"Статус: {element.status} (ожидался FAILED)"))

        finally:
            # 4. Восстановить base_url
            if provider and original_base_url is not None:
                provider.base_url = original_base_url
                provider.save()
                self.stdout.write(self.style.SUCCESS(f"Восстановлен base_url: {original_base_url}"))


