from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SceneViewSet

router = DefaultRouter()
router.register(r'', SceneViewSet, basename='scene')

urlpatterns = [
    path('', include(router.urls)),
]
