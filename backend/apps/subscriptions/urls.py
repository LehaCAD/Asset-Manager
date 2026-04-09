from django.urls import path

from . import views

urlpatterns = [
    path('plans/', views.PlanListView.as_view(), name='plan-list'),
    path(
        'feature-gate/<str:code>/',
        views.FeatureGateView.as_view(),
        name='feature-gate',
    ),
]
