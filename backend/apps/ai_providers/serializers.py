from rest_framework import serializers
from .models import AIModel, AIProvider


class AIProviderSerializer(serializers.ModelSerializer):
    """Сериализатор провайдера (без api_key — это секрет)."""

    class Meta:
        model = AIProvider
        fields = ('id', 'name', 'is_active')
        read_only_fields = fields


class AIModelSerializer(serializers.ModelSerializer):
    """
    Сериализатор AI-модели для фронтенда.
    Отдает name, type, parameters_schema (для динамической формы),
    preview_url, description, tags, image_inputs_schema (для UI селектора и промпт-бара),
    но НЕ отдает request_schema и api_endpoint (внутренние детали).
    """
    provider_name = serializers.CharField(source='provider.name', read_only=True)

    class Meta:
        model = AIModel
        fields = (
            'id',
            'name',
            'model_type',
            'provider_name',
            'parameters_schema',
            'preview_url',
            'description',
            'tags',
            'image_inputs_schema',
            'is_active',
        )
        read_only_fields = fields
