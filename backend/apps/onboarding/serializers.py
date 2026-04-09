from rest_framework import serializers
from .models import OnboardingTask, UserTaskCompletion


class OnboardingTaskSerializer(serializers.ModelSerializer):
    completed = serializers.BooleanField(read_only=True, default=False)
    completed_at = serializers.DateTimeField(read_only=True, default=None)
    empty_state = serializers.SerializerMethodField()

    class Meta:
        model = OnboardingTask
        fields = [
            'code', 'title', 'description', 'icon', 'reward',
            'order', 'completed', 'completed_at', 'empty_state',
        ]

    def get_empty_state(self, obj):
        if not obj.empty_state_page:
            return None
        return {
            'title': obj.empty_state_title,
            'description': obj.empty_state_desc,
            'cta': obj.empty_state_cta,
            'page': obj.empty_state_page,
        }
