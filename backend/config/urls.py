"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from apps.elements.views_webhook import generation_callback_view
from apps.common.views import health_check

from apps.feedback.admin import inbox_view as feedback_inbox_view

urlpatterns = [
    path('api/health/', health_check, name='health_check'),
    path('admin/feedback/inbox/', admin.site.admin_view(feedback_inbox_view), name='feedback_inbox'),
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.users.urls')),
    path('api/projects/', include('apps.projects.urls')),
    path('api/scenes/', include('apps.scenes.urls')),
    path('api/elements/', include('apps.elements.urls')),
    path('api/ai-models/', include('apps.ai_providers.urls')),
    path('api/ai/callback/', generation_callback_view),
    path('api/credits/', include('apps.credits.urls')),
    path('api/cabinet/', include('apps.cabinet.urls')),
    path('api/sharing/', include('apps.sharing.urls')),
    path('api/notifications/', include('apps.notifications.urls')),
    path('api/subscriptions/', include('apps.subscriptions.urls')),
    path('api/feedback/', include('apps.feedback.urls')),
]
