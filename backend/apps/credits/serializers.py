from rest_framework import serializers


class CreditsBalanceSerializer(serializers.Serializer):
    """Сериализатор для отображения баланса."""
    balance = serializers.CharField()
    pricing_percent = serializers.IntegerField()
    label = serializers.CharField()


class CreditsEstimateRequestSerializer(serializers.Serializer):
    """Сериализатор для запроса оценки стоимости."""
    ai_model_id = serializers.IntegerField(min_value=1)
    generation_config = serializers.DictField(
        child=serializers.JSONField(),
        required=False,
        default=dict,
    )


class CreditsEstimateResponseSerializer(serializers.Serializer):
    """Сериализатор для ответа оценки стоимости."""
    cost = serializers.CharField(allow_null=True)
    balance = serializers.CharField()
    can_afford = serializers.BooleanField()
    error = serializers.CharField(allow_null=True)


class TopUpCreateSerializer(serializers.Serializer):
    """Валидация запроса на создание платежа."""
    amount = serializers.IntegerField(min_value=100)
    payment_method_type = serializers.ChoiceField(choices=["sbp", "bank_card", "sberbank"])


class TopUpCreateResponseSerializer(serializers.Serializer):
    """Ответ на создание платежа."""
    payment_id = serializers.CharField()
    confirmation_url = serializers.CharField()
    amount = serializers.CharField()
    status = serializers.CharField()


class TopUpStatusSerializer(serializers.Serializer):
    """Статус платежа."""
    status = serializers.CharField()
    amount = serializers.CharField()
    balance = serializers.CharField(required=False)
