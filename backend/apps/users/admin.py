from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, UserQuota


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ('username', 'email', 'is_staff', 'created_at')
    list_filter = ('is_staff', 'is_superuser', 'is_active')
    search_fields = ('username', 'email')
    ordering = ('-created_at',)


@admin.register(UserQuota)
class UserQuotaAdmin(admin.ModelAdmin):
    list_display = ('user', 'max_projects', 'max_scenes_per_project', 'max_elements_per_scene', 'created_at')
    search_fields = ('user__username', 'user__email')
    list_filter = ('max_projects', 'max_scenes_per_project', 'max_elements_per_scene')
    ordering = ('-created_at',)
