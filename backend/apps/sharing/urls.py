from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'links', views.SharedLinkViewSet, basename='shared-link')

urlpatterns = [
    path('', include(router.urls)),
    path('public/<uuid:token>/', views.public_share_view),
    path('public/<uuid:token>/comments/', views.public_comment_view),
    path('elements/<int:element_id>/comments/', views.element_comments_view),
    path('scenes/<int:scene_id>/comments/', views.scene_comments_view),
    path('comments/<int:comment_id>/read/', views.mark_comment_read),
    path('comments/read-all/', views.mark_all_comments_read),
]
