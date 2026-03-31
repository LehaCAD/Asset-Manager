from django.urls import path
from . import views

urlpatterns = [
    path('', views.notification_list),
    path('unread-count/', views.unread_count),
    path('<int:notification_id>/read/', views.mark_read),
    path('read-all/', views.mark_all_read),
]
