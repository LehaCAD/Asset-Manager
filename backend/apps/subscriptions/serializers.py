from rest_framework import serializers

from .models import Feature, Plan, Subscription
from .services import SubscriptionService


class FeatureSerializer(serializers.ModelSerializer):
    class Meta:
        model = Feature
        fields = ['code', 'title', 'description', 'icon']


class PlanListSerializer(serializers.ModelSerializer):
    features = FeatureSerializer(many=True, read_only=True)

    class Meta:
        model = Plan
        fields = [
            'code',
            'name',
            'price',
            'credits_per_month',
            'max_projects',
            'max_scenes_per_project',
            'max_elements_per_scene',
            'storage_limit_gb',
            'features',
            'is_recommended',
            'display_order',
        ]


class SubscriptionSerializer(serializers.ModelSerializer):
    plan_code = serializers.CharField(source='plan.code', read_only=True)
    plan_name = serializers.CharField(source='plan.name', read_only=True)
    features = serializers.SerializerMethodField()
    is_trial = serializers.BooleanField(read_only=True)
    trial_days_left = serializers.IntegerField(read_only=True)

    class Meta:
        model = Subscription
        fields = [
            'plan_code',
            'plan_name',
            'status',
            'expires_at',
            'features',
            'is_trial',
            'trial_days_left',
        ]

    def get_features(self, obj):
        plan = SubscriptionService.get_active_plan(obj.user)
        return FeatureSerializer(plan.features.all(), many=True).data


class FeatureGateSerializer(serializers.Serializer):
    code = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField()
    icon = serializers.CharField()
    min_plan_name = serializers.CharField(allow_null=True)
    min_plan_price = serializers.FloatField(allow_null=True)
