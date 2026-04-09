from django.urls import path
from . import views

urlpatterns = [
    path('', views.OnboardingListView.as_view()),
    path('welcome-seen/', views.WelcomeSeenView.as_view()),
    path('complete/', views.CompleteTaskView.as_view()),
]
