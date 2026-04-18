from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ElementViewSet, download_meta
from apps.elements.views_upload import upload_complete

router = DefaultRouter()
router.register(r'', ElementViewSet, basename='element')

urlpatterns = [
    path('download-meta/', download_meta, name='download-meta'),
    path('<int:element_id>/complete/', upload_complete, name='upload-complete'),
    path('', include(router.urls)),
]
