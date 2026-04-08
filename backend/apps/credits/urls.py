from django.urls import path

from .views import (
    CreditsBalanceView,
    CreditsEstimateView,
    TopUpCreateView,
    TopUpWebhookView,
    TopUpStatusView,
)

urlpatterns = [
    path("balance/", CreditsBalanceView.as_view(), name="credits-balance"),
    path("estimate/", CreditsEstimateView.as_view(), name="credits-estimate"),
    path("topup/create/", TopUpCreateView.as_view(), name="topup-create"),
    path("topup/webhook/", TopUpWebhookView.as_view(), name="topup-webhook"),
    path("topup/<str:yookassa_payment_id>/status/", TopUpStatusView.as_view(), name="topup-status"),
]
