from rest_framework.permissions import BasePermission

from .services import SubscriptionService


class FeatureGatePermission(BasePermission):
    """Base permission that checks if user's plan includes a feature."""

    feature_code = None

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if not self.feature_code:
            return True
        return SubscriptionService.has_feature(request.user, self.feature_code)


def feature_required(feature_code):
    """Factory for creating feature gate permission classes."""

    class _Permission(FeatureGatePermission):
        pass

    _Permission.feature_code = feature_code
    _Permission.__name__ = f'FeatureGate_{feature_code}'
    return _Permission
