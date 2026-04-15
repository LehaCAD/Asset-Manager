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
            'storage_limit_gb',
            'features',
            'is_recommended',
            'display_order',
        ]


class SubscriptionSerializer(serializers.ModelSerializer):
    plan_code = serializers.SerializerMethodField()
    plan_name = serializers.SerializerMethodField()
    features = serializers.SerializerMethodField()
    is_trial = serializers.BooleanField(read_only=True)
    trial_days_left = serializers.IntegerField(read_only=True)
    trial_total_days = serializers.SerializerMethodField()

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
            'trial_total_days',
        ]

    def _get_active_plan(self, obj):
        if not hasattr(self, '_cached_plan') or self._cached_plan_user_id != obj.user_id:
            self._cached_plan = SubscriptionService.get_active_plan(obj.user)
            self._cached_plan_user_id = obj.user_id
        return self._cached_plan

    def get_plan_code(self, obj):
        return self._get_active_plan(obj).code

    def get_plan_name(self, obj):
        return self._get_active_plan(obj).name

    def get_features(self, obj):
        plan = self._get_active_plan(obj)
        return list(plan.features.values_list('code', flat=True))

    def get_trial_total_days(self, obj):
        if obj.status != 'trial':
            return None
        delta = obj.expires_at - obj.started_at
        return max(delta.days, 0)


class FeatureGateSerializer(serializers.Serializer):
    code = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField()
    icon = serializers.CharField()
    min_plan_name = serializers.CharField(allow_null=True)
    min_plan_price = serializers.FloatField(allow_null=True)
