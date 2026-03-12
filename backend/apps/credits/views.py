from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.ai_providers.models import AIModel

from .serializers import (
    CreditsBalanceSerializer,
    CreditsEstimateRequestSerializer,
    CreditsEstimateResponseSerializer,
)
from .services import CreditsService


class CreditsBalanceView(APIView):
    """Получить текущий баланс пользователя."""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        service = CreditsService()
        snapshot = service.get_balance_snapshot(request.user)
        serializer = CreditsBalanceSerializer(snapshot)
        return Response(serializer.data)


class CreditsEstimateView(APIView):
    """Оценить стоимость генерации."""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        serializer = CreditsEstimateRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": "Некорректные параметры запроса.", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        ai_model_id = serializer.validated_data["ai_model_id"]
        generation_config = serializer.validated_data.get("generation_config", {})
        
        # Получаем модель
        try:
            ai_model = AIModel.objects.get(pk=ai_model_id, is_active=True)
        except AIModel.DoesNotExist:
            return Response(
                {"error": "Модель не найдена или неактивна."},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Оцениваем стоимость
        service = CreditsService()
        result = service.estimate_generation(
            user=request.user,
            ai_model=ai_model,
            generation_config=generation_config
        )
        
        response_data = {
            "cost": str(result.cost) if result.cost is not None else None,
            "balance": str(result.balance),
            "can_afford": result.can_afford,
            "error": result.error,
        }
        
        response_serializer = CreditsEstimateResponseSerializer(response_data)
        return Response(response_serializer.data)
