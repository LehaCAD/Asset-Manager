from django import forms
from .models import OnboardingTask

ICON_NAMES = [
    'folder-open', 'layout-grid', 'wand-sparkles', 'image', 'maximize',
    'download', 'upload', 'refresh-cw', 'share-2', 'trophy',
    'star', 'zap', 'sparkles', 'palette', 'video',
    'film', 'camera', 'layers', 'grid-3x3', 'copy',
    'scissors', 'type', 'pen-tool', 'eye', 'heart',
    'bookmark', 'bell', 'settings', 'user', 'lock',
]


class OnboardingTaskAdminForm(forms.ModelForm):
    class Meta:
        model = OnboardingTask
        fields = '__all__'

    def get_context(self):
        context = super().get_context() if hasattr(super(), 'get_context') else {}
        context['icon_names'] = ICON_NAMES
        return context
