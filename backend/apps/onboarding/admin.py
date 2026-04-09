from django.contrib import admin
from .models import OnboardingTask, UserOnboardingState, UserTaskCompletion
from .admin_forms import OnboardingTaskAdminForm


@admin.register(OnboardingTask)
class OnboardingTaskAdmin(admin.ModelAdmin):
    form = OnboardingTaskAdminForm
    change_form_template = 'admin/onboarding/onboardingtask/change_form.html'

    list_display = ('order', 'title', 'icon', 'reward', 'category', 'is_active')
    list_editable = ('order', 'is_active')
    list_display_links = ('title',)
    ordering = ('order',)

    readonly_fields = ('code', 'category', 'trigger_type', 'trigger_event', 'created_at')

    fieldsets = (
        ('Основное', {
            'fields': ('title', 'description', 'reward', 'order', 'is_active'),
        }),
        ('Иконка', {
            'fields': ('icon',),
        }),
        ('Текст пустого экрана', {
            'fields': ('empty_state_title', 'empty_state_desc', 'empty_state_cta', 'empty_state_page'),
        }),
        ('Техническое', {
            'fields': ('code', 'category', 'trigger_type', 'trigger_event', 'created_at'),
            'classes': ('collapse',),
        }),
    )

    class Media:
        js = (
            'admin/onboarding/icon_picker.js',
            'admin/onboarding/task_preview.js',
        )
        css = {
            'all': ('admin/onboarding/onboarding_admin.css',),
        }


@admin.register(UserOnboardingState)
class UserOnboardingStateAdmin(admin.ModelAdmin):
    list_display = ('user', 'welcome_seen', 'backfill_done')
    readonly_fields = ('user', 'welcome_seen', 'backfill_done')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
