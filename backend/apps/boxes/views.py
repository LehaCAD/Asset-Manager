from rest_framework import viewsets, permissions, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import Scene
from .serializers import SceneSerializer, ReorderSerializer
from .services import reorder_scenes
from .s3_utils import upload_file_to_s3, detect_element_type, validate_file_type, generate_video_thumbnail


class IsProjectOwner(permissions.BasePermission):
    """Пермишен: пользователь может работать только со сценами своих проектов."""
    
    def has_object_permission(self, request, view, obj):
        return obj.project.user == request.user


class SceneViewSet(viewsets.ModelViewSet):
    """
    ViewSet для CRUD операций со сценами.
    
    list: Получить список сцен пользователя (с фильтрацией по project)
    create: Создать новую сцену
    retrieve: Получить детали сцены
    update: Обновить сцену (PUT)
    partial_update: Частично обновить сцену (PATCH)
    destroy: Удалить сцену
    """
    serializer_class = SceneSerializer
    permission_classes = [IsAuthenticated, IsProjectOwner]
    
    def get_queryset(self):
        """Возвращает только сцены проектов текущего пользователя с фильтрацией."""
        queryset = Scene.objects.filter(
            project__user=self.request.user
        ).select_related('project', 'headliner').prefetch_related('elements')
        
        # Фильтрация по project через query params
        project_id = self.request.query_params.get('project', None)
        if project_id is not None:
            queryset = queryset.filter(project_id=project_id)
        
        return queryset
    
    def create(self, request, *args, **kwargs):
        """
        Переопределяем create для проверки, что project принадлежит пользователю и проверки лимитов.
        """
        project_id = request.data.get('project')
        
        if not project_id:
            return Response(
                {'project': ['This field is required.']},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Проверка, что project принадлежит текущему пользователю
        from apps.projects.models import Project
        try:
            project = Project.objects.get(id=project_id, user=request.user)
        except Project.DoesNotExist:
            return Response(
                {'project': ['Project not found or you do not have permission.']},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Проверяем лимит сцен в проекте
        user_quota = request.user.quota
        current_scenes_count = Scene.objects.filter(project=project).count()
        
        if current_scenes_count >= user_quota.max_scenes_per_project:
            return Response(
                {'detail': f'Достигнут лимит сцен в проекте ({user_quota.max_scenes_per_project}). Обратитесь к администратору.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        return super().create(request, *args, **kwargs)
    
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsProjectOwner])
    def upload(self, request, pk=None):
        """
        Загрузить файл на S3 и создать Element.
        
        POST /api/scenes/{id}/upload/
        
        Принимает:
        - file: файл (multipart/form-data)
        - prompt_text: текст промпта (опционально)
        - is_favorite: флаг избранного (опционально, default=False)
        
        Возвращает:
        - Данные созданного Element (ElementSerializer)
        """
        scene = self.get_object()
        
        # Проверка наличия файла
        if 'file' not in request.FILES:
            return Response(
                {'error': 'File is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        file = request.FILES['file']
        
        # Валидация типа файла
        if not validate_file_type(file.name):
            return Response(
                {'error': 'Неподдерживаемый формат файла. Допустимые форматы: JPG, PNG, MP4'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Определение типа элемента по расширению
        element_type = detect_element_type(file.name)
        
        # Проверяем лимит элементов в сцене
        user_quota = request.user.quota
        current_elements_count = scene.elements.count()
        
        if current_elements_count >= user_quota.max_elements_per_scene:
            return Response(
                {'detail': f'Достигнут лимит элементов в сцене ({user_quota.max_elements_per_scene}). Обратитесь к администратору.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            # Загрузка файла на S3 с новой структурой папок
            file_url, filename = upload_file_to_s3(
                file, 
                project_id=scene.project.id,
                scene_id=scene.id
            )
            
            # Генерация превью для видео
            thumbnail_url = None
            if element_type == 'VIDEO':
                # Сбрасываем указатель файла в начало для повторного чтения
                file.seek(0)
                thumbnail_url = generate_video_thumbnail(file, scene.project.id, scene.id)
            
            # Создание Element
            from apps.assets.models import Element
            from apps.assets.serializers import ElementSerializer
            
            # Автоматически ставим order_index
            next_order_index = scene.elements.count()
            
            element_data = {
                'scene': scene.id,
                'element_type': element_type,
                'file_url': file_url,
                'order_index': next_order_index,
                'prompt_text': request.data.get('prompt_text', ''),
                'is_favorite': request.data.get('is_favorite', False),
            }
            
            # Добавляем thumbnail_url если был сгенерирован
            if thumbnail_url:
                element_data['thumbnail_url'] = thumbnail_url
            
            # Если есть AI модель
            ai_model_id = request.data.get('ai_model')
            if ai_model_id:
                element_data['ai_model'] = ai_model_id
            
            # Создаем через serializer для валидации
            serializer = ElementSerializer(data=element_data)
            serializer.is_valid(raise_exception=True)
            element = serializer.save()
            
            return Response(
                ElementSerializer(element).data,
                status=status.HTTP_201_CREATED
            )
        
        except Exception as e:
            return Response(
                {'error': f'Failed to upload file: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsProjectOwner])
    def generate(self, request, pk=None):
        """
        Запустить AI генерацию элемента.
        
        POST /api/scenes/{id}/generate/
        
        Принимает:
        - prompt: текст промпта (обязательно)
        - ai_model_id: ID AI модели (обязательно)
        - generation_config: параметры генерации (опционально, dict)
        - parent_element_id: ID родительского элемента для img2vid (опционально)
        
        Возвращает:
        - Данные созданного Element с status=PENDING
        """
        scene = self.get_object()
        
        # Валидация входных данных
        prompt = request.data.get('prompt')
        ai_model_id = request.data.get('ai_model_id')
        
        if not prompt:
            return Response(
                {'error': 'Prompt is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not ai_model_id:
            return Response(
                {'error': 'AI model ID is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Проверка существования AI модели
        from apps.ai_providers.models import AIModel
        try:
            ai_model = AIModel.objects.get(id=ai_model_id, is_active=True)
        except AIModel.DoesNotExist:
            return Response(
                {'error': 'AI model not found or inactive'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Проверка родительского элемента (если указан)
        parent_element = None
        parent_element_id = request.data.get('parent_element_id')
        if parent_element_id:
            from apps.assets.models import Element
            try:
                parent_element = Element.objects.get(
                    id=parent_element_id,
                    scene__project__user=request.user  # Проверка владения
                )
            except Element.DoesNotExist:
                return Response(
                    {'error': 'Parent element not found or you do not have permission'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # Определение типа элемента по модели
        element_type = ai_model.model_type  # IMAGE или VIDEO
        
        # Проверяем лимит элементов в сцене
        user_quota = request.user.quota
        current_elements_count = scene.elements.count()
        
        if current_elements_count >= user_quota.max_elements_per_scene:
            return Response(
                {'detail': f'Достигнут лимит элементов в сцене ({user_quota.max_elements_per_scene}). Обратитесь к администратору.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Определение source_type
        from apps.assets.models import Element
        if parent_element:
            source_type = Element.SOURCE_IMG2VID
        else:
            source_type = Element.SOURCE_GENERATED
        
        try:
            # Автоматически ставим order_index
            next_order_index = scene.elements.count()
            # Создание Element
            from apps.assets.serializers import ElementSerializer
            
            element_data = {
                'scene': scene.id,
                'element_type': element_type,
                'order_index': next_order_index,
                'prompt_text': prompt,
                'ai_model': ai_model_id,
                'generation_config': request.data.get('generation_config', {}),
                'status': Element.STATUS_PENDING,
                'source_type': source_type,
            }
            
            if parent_element:
                element_data['parent_element'] = parent_element.id
            
            # Создаем через serializer для валидации
            serializer = ElementSerializer(data=element_data)
            serializer.is_valid(raise_exception=True)
            element = serializer.save()
            
            # Запускаем асинхронную генерацию
            from apps.assets.tasks import start_generation
            start_generation.delay(element.id)
            
            return Response(
                ElementSerializer(element).data,
                status=status.HTTP_201_CREATED
            )
        
        except Exception as e:
            return Response(
                {'error': f'Failed to start generation: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsProjectOwner])
    def set_headliner(self, request, pk=None):
        """
        Назначить лучший элемент для сцены.
        
        POST /api/scenes/{id}/set_headliner/
        
        Принимает:
        - element_id: ID элемента (обязательно). Передать null для сброса.
        """
        scene = self.get_object()
        element_id = request.data.get('element_id')

        if element_id is None:
            scene.headliner = None
            scene.save(update_fields=['headliner', 'updated_at'])
            return Response(SceneSerializer(scene).data)

        from apps.assets.models import Element
        try:
            element = Element.objects.get(id=element_id, scene=scene)
        except Element.DoesNotExist:
            return Response(
                {'error': 'Элемент не найден или не принадлежит этой сцене.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        scene.headliner = element
        scene.save(update_fields=['headliner', 'updated_at'])
        return Response(SceneSerializer(scene).data)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def reorder(self, request):
        """
        Изменить порядок сцен.
        
        POST /api/scenes/reorder/
        
        Принимает:
        - scene_ids: [1, 3, 2, ...] — список ID сцен в новом порядке
        """
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        scene_ids = serializer.validated_data['scene_ids']

        # Проверяем, что все сцены принадлежат пользователю
        user_scene_ids = set(
            Scene.objects.filter(
                project__user=request.user,
                id__in=scene_ids
            ).values_list('id', flat=True)
        )
        if set(scene_ids) != user_scene_ids:
            return Response(
                {'error': 'Некоторые сцены не найдены или не принадлежат вам.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reorder_scenes(scene_ids)
        return Response({'status': 'ok'})
