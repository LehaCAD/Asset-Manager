from rest_framework import viewsets, permissions
from rest_framework.permissions import IsAuthenticated
from .models import Project
from .serializers import ProjectSerializer


class IsOwner(permissions.BasePermission):
    """Пермишен: пользователь может работать только со своими проектами."""
    
    def has_object_permission(self, request, view, obj):
        return obj.user == request.user


class ProjectViewSet(viewsets.ModelViewSet):
    """
    ViewSet для CRUD операций с проектами.
    
    list: Получить список проектов текущего пользователя
    create: Создать новый проект
    retrieve: Получить детали проекта
    update: Обновить проект (PUT)
    partial_update: Частично обновить проект (PATCH)
    destroy: Удалить проект
    """
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated, IsOwner]
    
    def get_queryset(self):
        """Возвращает только проекты текущего пользователя."""
        return Project.objects.filter(user=self.request.user).prefetch_related('boxes')
    
    def perform_create(self, serializer):
        """При создании автоматически устанавливает текущего пользователя и проверяет лимиты."""
        user = self.request.user
        
        # Проверяем лимит проектов
        user_quota = user.quota
        current_projects_count = Project.objects.filter(user=user).count()
        
        if current_projects_count >= user_quota.max_projects:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(
                f'Достигнут лимит проектов ({user_quota.max_projects}). Обратитесь к администратору.'
            )
        
        serializer.save(user=user)
