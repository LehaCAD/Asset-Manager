from django.urls import path

from .views import CreditsBalanceView, CreditsEstimateView

urlpatterns = [
    path("balance/", CreditsBalanceView.as_view(), name="credits-balance"),
    path("estimate/", CreditsEstimateView.as_view(), name="credits-estimate"),
]
