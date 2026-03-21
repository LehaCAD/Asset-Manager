from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
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
        return Project.objects.filter(user=self.request.user).prefetch_related('scenes')
    
    def perform_create(self, serializer):
        """При создании автоматически устанавливает текущего пользователя и проверяет лимиты."""
        user = self.request.user
        
        # # Проверяем лимит проектов
        # user_quota = user.quota
        # current_projects_count = Project.objects.filter(user=user).count()
        # if current_projects_count >= user_quota.max_projects:
        #     from rest_framework.exceptions import PermissionDenied
        #     raise PermissionDenied(
        #         f'Достигнут лимит проектов ({user_quota.max_projects}). Обратитесь к администратору.'
        #     )
        #
        serializer.save(user=user)

    @action(detail=True, methods=['post'], url_path='reorder-items')
    def reorder_items(self, request, pk=None):
        """
        Reorder mixed grid of elements and groups.
        Accepts: item_order: [{type: "element", id: 1}, {type: "group", id: 2}, ...]
        """
        project = self.get_object()
        item_order = request.data.get('item_order', [])

        from apps.elements.models import Element
        from apps.scenes.models import Scene

        for index, item in enumerate(item_order):
            item_type = item.get('type')
            item_id = item.get('id')

            if item_type == 'element':
                Element.objects.filter(id=item_id, project=project).update(order_index=index)
            elif item_type == 'group':
                Scene.objects.filter(id=item_id, project=project).update(order_index=index)

        return Response({'status': 'ok'})

    @action(detail=True, methods=['post'])
    def generate(self, request, pk=None):
        """
        Запустить AI генерацию элемента на уровне проекта (без группы).

        POST /api/projects/{id}/generate/
        """
        project = self.get_object()
        from apps.elements.services import create_generation
        data, http_status = create_generation(
            project=project, scene=None,
            prompt=request.data.get('prompt'),
            ai_model_id=request.data.get('ai_model_id'),
            generation_config=request.data.get('generation_config', {}),
            user=request.user,
        )
        return Response(data, status=http_status)

    @action(detail=True, methods=['post'])
    def upload(self, request, pk=None):
        """
        Загрузить файл на уровне проекта (без группы).

        POST /api/projects/{id}/upload/
        """
        project = self.get_object()
        if 'file' not in request.FILES:
            return Response({'error': 'File is required'}, status=status.HTTP_400_BAD_REQUEST)
        from apps.elements.services import create_upload
        data, http_status = create_upload(
            project=project, scene=None,
            file=request.FILES['file'],
            prompt_text=request.data.get('prompt_text', ''),
            is_favorite=request.data.get('is_favorite', False),
            ai_model_id=request.data.get('ai_model'),
        )
        return Response(data, status=http_status)
