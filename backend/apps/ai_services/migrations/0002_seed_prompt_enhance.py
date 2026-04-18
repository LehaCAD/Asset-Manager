"""Seed data: Polza.ai provider + GPT-4.1-mini prompt enhancement service."""

from django.db import migrations

SYSTEM_PROMPT = """You are an image generation prompt enhancer.

Input: a user's prompt for AI image/video generation.
Output: ONLY a JSON object: {"enhanced_prompt": "enhanced text here"}

Rules:
- Enhance every prompt with specific visual details: composition, lighting, style, quality, camera angle
- Preserve the user's language (Russian stays Russian, English stays English)
- Preserve the user's intent — do not add unrelated subjects or change the meaning
- Be concise and practical — no poetic or flowery descriptions
- Do not explain anything — output ONLY the JSON object
- Do not add elements the user did not mention or imply
- If the prompt mentions a style (anime, realistic, etc.), enhance within that style
- Always include quality keywords appropriate for the generation model (high detail, sharp focus, etc.)"""


def create_seed_data(apps, schema_editor):
    LLMProvider = apps.get_model("ai_services", "LLMProvider")
    AIService = apps.get_model("ai_services", "AIService")

    provider, _ = LLMProvider.objects.get_or_create(
        name="Polza.ai",
        defaults={
            "provider_type": "openai_compatible",
            "api_base_url": "https://polza.ai/api/v1",
            "api_key": "pza_ej4E19plxdaggqItuvzxmJfqE7tojRJc",
            "is_active": True,
        },
    )

    AIService.objects.get_or_create(
        service_type="PROMPT_ENHANCE",
        is_active=True,
        defaults={
            "name": "GPT-4.1-mini Enhance",
            "provider": provider,
            "model_name": "openai/gpt-4.1-mini",
            "system_prompt": SYSTEM_PROMPT,
            "parameters": {
                "temperature": 0.7,
                "max_tokens": 600,
                "top_p": 1.0,
                "timeout": 15,
            },
            "cost_per_call": 1.00,
        },
    )


def remove_seed_data(apps, schema_editor):
    AIService = apps.get_model("ai_services", "AIService")
    LLMProvider = apps.get_model("ai_services", "LLMProvider")

    AIService.objects.filter(
        service_type="PROMPT_ENHANCE", name="GPT-4.1-mini Enhance"
    ).delete()
    LLMProvider.objects.filter(name="Polza.ai").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("ai_services", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_seed_data, remove_seed_data),
    ]
