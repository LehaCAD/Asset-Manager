from django.urls import path
from . import views

urlpatterns = [
    path('analytics/', views.analytics_view, name='cabinet-analytics'),
    path('history/', views.history_view, name='cabinet-history'),
    path('transactions/', views.transactions_view, name='cabinet-transactions'),
    path('storage/', views.storage_view, name='cabinet-storage'),
]
