from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Plan
from .serializers import FeatureGateSerializer, PlanListSerializer
from .services import SubscriptionService


class PlanListView(generics.ListAPIView):
    """Public list of active plans."""

    permission_classes = [AllowAny]
    serializer_class = PlanListSerializer
    queryset = Plan.objects.filter(is_active=True).prefetch_related('features')


class FeatureGateView(APIView):
    """Returns feature gate info for upgrade modals."""

    permission_classes = [IsAuthenticated]

    def get(self, request, code):
        info = SubscriptionService.get_feature_gate_info(code)
        if info is None:
            return Response(
                {'detail': 'Feature not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = FeatureGateSerializer(info)
        return Response(serializer.data)
