"""
Скрипт для создания AI провайдера Kie.ai и модели Seedance в Django.

Запуск:
docker compose exec backend python manage.py shell < setup_kie_ai.py
"""

print("=" * 60)
print("Настройка Kie.ai провайдера и моделей")
print("=" * 60)

from apps.ai_providers.models import AIProvider, AIModel

# Создание провайдера Kie.ai
provider, created = AIProvider.objects.get_or_create(
    name='Kie.ai',
    defaults={
        'base_url': 'https://api.kie.ai',
        'api_key': 'YOUR_API_KEY_HERE',  # Замените на реальный ключ!
        'is_active': True
    }
)

if created:
    print(f"✅ Создан провайдер: {provider.name}")
else:
    print(f"ℹ️  Провайдер уже существует: {provider.name}")

# Создание модели Seedance 1.5 Pro (video generation)
model_seedance, created = AIModel.objects.get_or_create(
    provider=provider,
    name='Seedance 1.5 Pro',
    defaults={
        'model_type': AIModel.MODEL_TYPE_VIDEO,
        'api_endpoint': '/api/v1/jobs/createTask',
        'request_schema': {
            "model": "bytedance/seedance-1.5-pro",
            "input": {
                "prompt": "{{prompt}}",
                "input_urls": "{{input_urls}}",
                "aspect_ratio": "{{aspect_ratio}}",
                "resolution": "{{resolution}}",
                "duration": "{{duration}}"
            }
        },
        'parameters_schema': {
            "aspect_ratio": {
                "type": "select",
                "options": ["16:9", "9:16", "1:1"],
                "default": "16:9"
            },
            "resolution": {
                "type": "select",
                "options": ["720p", "1080p"],
                "default": "720p"
            },
            "duration": {
                "type": "select",
                "options": ["5", "8", "10"],
                "default": "8"
            }
        },
        'is_active': True
    }
)

if created:
    print(f"✅ Создана модель: {model_seedance.name}")
else:
    print(f"ℹ️  Модель уже существует: {model_seedance.name}")

# Создание модели Nano Banana (image generation)
model_nano, created = AIModel.objects.get_or_create(
    provider=provider,
    name='Nano Banana',
    defaults={
        'model_type': AIModel.MODEL_TYPE_IMAGE,
        'api_endpoint': '/api/v1/jobs/createTask',
        'request_schema': {
            "model": "kie/nano-banana",
            "input": {
                "prompt": "{{prompt}}",
                "width": "{{width}}",
                "height": "{{height}}",
                "steps": "{{steps}}"
            }
        },
        'parameters_schema': {
            "width": {
                "type": "select",
                "options": [512, 768, 1024],
                "default": 1024
            },
            "height": {
                "type": "select",
                "options": [512, 768, 1024],
                "default": 768
            },
            "steps": {
                "type": "slider",
                "min": 20,
                "max": 50,
                "default": 30
            }
        },
        'is_active': True
    }
)

if created:
    print(f"✅ Создана модель: {model_nano.name}")
else:
    print(f"ℹ️  Модель уже существует: {model_nano.name}")

print("\n" + "=" * 60)
print("Настройка завершена!")
print("=" * 60)
print("\n📝 Следующие шаги:")
print("1. Добавьте API ключ Kie.ai в админке")
print("   http://localhost:8000/admin/ai_providers/aiprovider/")
print("\n2. Или обновите через shell:")
print("   provider = AIProvider.objects.get(name='Kie.ai')")
print("   provider.api_key = 'ваш_ключ'")
print("   provider.save()")
print("\n3. Теперь можно запускать генерацию:")
print("   POST /api/boxes/{id}/generate/")
print("=" * 60)
