from rest_framework import viewsets, permissions
from rest_framework.permissions import IsAuthenticated
from .models import AIModel
from .serializers import AIModelSerializer


class AIModelViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only ViewSet для AI-моделей.
    Фронт использует для:
    - Дропдаун выбора модели при генерации
    - Динамическое построение формы параметров из parameters_schema
    
    GET /api/ai-models/            — все активные модели
    GET /api/ai-models/?type=IMAGE — только модели для изображений
    GET /api/ai-models/?type=VIDEO — только модели для видео
    GET /api/ai-models/{id}/       — детали конкретной модели
    """
    serializer_class = AIModelSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = AIModel.objects.filter(
            is_active=True,
            provider__is_active=True,
        ).select_related('provider')

        # Фильтр по типу модели
        model_type = self.request.query_params.get('type')
        if model_type and model_type.upper() in ('IMAGE', 'VIDEO'):
            queryset = queryset.filter(model_type=model_type.upper())

        return queryset
