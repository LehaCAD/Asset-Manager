from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ElementViewSet

router = DefaultRouter()
router.register(r'', ElementViewSet, basename='element')

urlpatterns = [
    path('', include(router.urls)),
]
