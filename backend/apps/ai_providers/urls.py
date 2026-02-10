from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AIModelViewSet

router = DefaultRouter()
router.register(r'', AIModelViewSet, basename='ai-model')

urlpatterns = [
    path('', include(router.urls)),
]
