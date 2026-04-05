from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import (
    RegisterView, MeView, change_password_view,
    VerifyEmailView, ResendVerificationView,
    ForgotPasswordView, ResetPasswordView,
)
from .throttles import AuthRateThrottle

urlpatterns = [
    path('register/', RegisterView.as_view(), name='auth-register'),
    path('login/', TokenObtainPairView.as_view(throttle_classes=[AuthRateThrottle]), name='auth-login'),
    path('token/refresh/', TokenRefreshView.as_view(throttle_classes=[AuthRateThrottle]), name='auth-token-refresh'),
    path('me/', MeView.as_view(), name='auth-me'),
    path('me/password/', change_password_view, name='auth-change-password'),
    path('verify-email/', VerifyEmailView.as_view(), name='verify_email'),
    path('resend-verification/', ResendVerificationView.as_view(), name='resend_verification'),
    path('forgot-password/', ForgotPasswordView.as_view(), name='forgot_password'),
    path('reset-password/', ResetPasswordView.as_view(), name='reset_password'),
]
