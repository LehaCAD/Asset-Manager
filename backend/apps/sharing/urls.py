from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'links', views.SharedLinkViewSet, basename='shared-link')

urlpatterns = [
    path('', include(router.urls)),
    path('public/<uuid:token>/', views.public_share_view),
    path('public/<uuid:token>/comments/', views.public_comment_view),
    path('public/<uuid:token>/reactions/', views.public_reaction_view),
    path('public/<uuid:token>/review/', views.public_review_action, name='public-review'),
    path('elements/<int:element_id>/comments/', views.element_comments_view),
    path('elements/<int:element_id>/reactions/', views.element_reactions_view),
    path('elements/<int:element_id>/reviews/', views.element_reviews_view),
    path('scenes/<int:scene_id>/comments/', views.scene_comments_view),
    path('links/<int:link_id>/comments/', views.link_comments_view, name='link-comments'),
    path('comments/<int:comment_id>/read/', views.mark_comment_read),
    path('comments/read-all/', views.mark_all_comments_read),
    path('project-feedback/<int:project_id>/', views.project_feedback_view, name='project-feedback'),
    path('project-elements/<int:project_id>/', views.project_element_ids),
    path('group-elements/<int:scene_id>/', views.group_element_ids),
]
