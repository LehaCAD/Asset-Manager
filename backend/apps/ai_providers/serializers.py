from rest_framework import serializers
from .models import AIModel, AIProvider, ModelFamily


class AIProviderSerializer(serializers.ModelSerializer):
    """Сериализатор провайдера (без api_key — это секрет)."""

    class Meta:
        model = AIProvider
        fields = ('id', 'name', 'is_active')
        read_only_fields = fields


class ModelFamilyBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = ModelFamily
        fields = ('id', 'name', 'preview_url', 'description', 'tags', 'variant_ui_control')
        read_only_fields = fields


class AIModelSerializer(serializers.ModelSerializer):
    """
    Сериализатор AI-модели для фронтенда.
    Отдает name, type, parameters_schema (для динамической формы),
    preview_url, description, tags, image_inputs_schema (для UI селектора и промпт-бара),
    но НЕ отдает request_schema и api_endpoint (внутренние детали).
    """
    provider_name = serializers.CharField(source='provider.name', read_only=True)
    parameters_schema = serializers.SerializerMethodField()
    preview_url = serializers.SerializerMethodField()
    family = ModelFamilyBriefSerializer(read_only=True)

    def get_parameters_schema(self, obj):
        return obj.get_runtime_parameters_schema()

    def get_preview_url(self, obj):
        return obj.get_preview_url()

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
            'family',
            'variant_label',
            'is_default_variant',
            'variant_sort_order',
        )
        read_only_fields = fields
