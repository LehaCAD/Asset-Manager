import os

from django.db import models


class LLMProvider(models.Model):
    """LLM-провайдер для внутренних AI-сервисов."""

    OPENAI_COMPATIBLE = "openai_compatible"
    ANTHROPIC = "anthropic"

    PROVIDER_TYPE_CHOICES = [
        (OPENAI_COMPATIBLE, "OpenAI-compatible"),
        (ANTHROPIC, "Anthropic"),
    ]

    name = models.CharField(max_length=100)
    provider_type = models.CharField(max_length=20, choices=PROVIDER_TYPE_CHOICES)
    api_base_url = models.URLField()
    api_key = models.CharField(
        max_length=500,
        help_text="API-ключ. Префикс ENV: читает из переменной окружения.",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "LLM-провайдер"
        verbose_name_plural = "LLM-провайдеры"

    def __str__(self):
        return self.name

    def resolve_api_key(self) -> str:
        """Resolve API key: if prefixed with ENV:, read from environment."""
        if self.api_key.startswith("ENV:"):
            env_var = self.api_key[4:]
            value = os.environ.get(env_var)
            if value is None:
                raise ValueError(
                    f"Environment variable '{env_var}' not found "
                    f"(referenced by provider '{self.name}')"
                )
            return value
        return self.api_key


class AIService(models.Model):
    """AI-сервис: конфигурация конкретной LLM-задачи."""

    PROMPT_ENHANCE = "PROMPT_ENHANCE"
    SMART_EDIT = "SMART_EDIT"

    SERVICE_TYPE_CHOICES = [
        (PROMPT_ENHANCE, "Улучшение промпта"),
        (SMART_EDIT, "Умное редактирование"),
    ]

    service_type = models.CharField(max_length=20, choices=SERVICE_TYPE_CHOICES)
    name = models.CharField(max_length=100)
    provider = models.ForeignKey(
        LLMProvider,
        on_delete=models.PROTECT,
        related_name="services",
    )
    model_name = models.CharField(max_length=100)
    system_prompt = models.TextField()
    parameters = models.JSONField(default=dict, blank=True)
    cost_per_call = models.DecimalField(max_digits=10, decimal_places=2)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "AI-сервис"
        verbose_name_plural = "AI-сервисы"
        constraints = [
            models.UniqueConstraint(
                fields=["service_type"],
                condition=models.Q(is_active=True),
                name="unique_active_service_per_type",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.model_name})"

    def get_timeout(self) -> int:
        """Return timeout in seconds from parameters, default 15."""
        return self.parameters.get("timeout", 15)
