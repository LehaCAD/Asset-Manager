from rest_framework import viewsets, permissions, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import Box
from .serializers import BoxSerializer, ReorderSerializer
from .services import reorder_boxes
from .s3_utils import upload_file_to_s3, detect_asset_type, validate_file_type, generate_video_thumbnail


class IsProjectOwner(permissions.BasePermission):
    """Пермишен: пользователь может работать только со сценами своих проектов."""
    
    def has_object_permission(self, request, view, obj):
        return obj.project.user == request.user


class BoxViewSet(viewsets.ModelViewSet):
    """
    ViewSet для CRUD операций со сценами.
    
    list: Получить список сцен пользователя (с фильтрацией по project)
    create: Создать новую сцену
    retrieve: Получить детали сцены
    update: Обновить сцену (PUT)
    partial_update: Частично обновить сцену (PATCH)
    destroy: Удалить сцену
    """
    serializer_class = BoxSerializer
    permission_classes = [IsAuthenticated, IsProjectOwner]
    
    def get_queryset(self):
        """Возвращает только сцены проектов текущего пользователя с фильтрацией."""
        queryset = Box.objects.filter(
            project__user=self.request.user
        ).select_related('project', 'headliner').prefetch_related('assets')
        
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
        current_boxes_count = Box.objects.filter(project=project).count()
        
        if current_boxes_count >= user_quota.max_boxes_per_project:
            return Response(
                {'detail': f'Достигнут лимит сцен в проекте ({user_quota.max_boxes_per_project}). Обратитесь к администратору.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        return super().create(request, *args, **kwargs)
    
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsProjectOwner])
    def upload(self, request, pk=None):
        """
        Загрузить файл на S3 и создать Asset.
        
        POST /api/boxes/{id}/upload/
        
        Принимает:
        - file: файл (multipart/form-data)
        - prompt_text: текст промпта (опционально)
        - is_favorite: флаг избранного (опционально, default=False)
        
        Возвращает:
        - Данные созданного Asset (AssetSerializer)
        """
        box = self.get_object()
        
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
        asset_type = detect_asset_type(file.name)
        
        # Проверяем лимит элементов в сцене
        user_quota = request.user.quota
        current_assets_count = box.assets.count()
        
        if current_assets_count >= user_quota.max_assets_per_box:
            return Response(
                {'detail': f'Достигнут лимит элементов в сцене ({user_quota.max_assets_per_box}). Обратитесь к администратору.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            # Загрузка файла на S3 с новой структурой папок
            file_url, filename = upload_file_to_s3(
                file, 
                project_id=box.project.id,
                box_id=box.id
            )
            
            # Генерация превью для видео
            thumbnail_url = None
            if asset_type == 'VIDEO':
                # Сбрасываем указатель файла в начало для повторного чтения
                file.seek(0)
                thumbnail_url = generate_video_thumbnail(file, box.project.id, box.id)
            
            # Создание Asset
            from apps.assets.models import Asset
            from apps.assets.serializers import AssetSerializer
            
            # Автоматически ставим order_index
            next_order_index = box.assets.count()
            
            asset_data = {
                'box': box.id,
                'asset_type': asset_type,
                'file_url': file_url,
                'order_index': next_order_index,
                'prompt_text': request.data.get('prompt_text', ''),
                'is_favorite': request.data.get('is_favorite', False),
            }
            
            # Добавляем thumbnail_url если был сгенерирован
            if thumbnail_url:
                asset_data['thumbnail_url'] = thumbnail_url
            
            # Если есть AI модель
            ai_model_id = request.data.get('ai_model')
            if ai_model_id:
                asset_data['ai_model'] = ai_model_id
            
            # Создаем через serializer для валидации
            serializer = AssetSerializer(data=asset_data)
            serializer.is_valid(raise_exception=True)
            asset = serializer.save()
            
            return Response(
                AssetSerializer(asset).data,
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
        
        POST /api/boxes/{id}/generate/
        
        Принимает:
        - prompt: текст промпта (обязательно)
        - ai_model_id: ID AI модели (обязательно)
        - generation_config: параметры генерации (опционально, dict)
        - parent_asset_id: ID родительского элемента для img2vid (опционально)
        
        Возвращает:
        - Данные созданного Asset с status=PENDING
        """
        box = self.get_object()
        
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
        parent_asset = None
        parent_asset_id = request.data.get('parent_asset_id')
        if parent_asset_id:
            from apps.assets.models import Asset
            try:
                parent_asset = Asset.objects.get(
                    id=parent_asset_id,
                    box__project__user=request.user  # Проверка владения
                )
            except Asset.DoesNotExist:
                return Response(
                    {'error': 'Parent asset not found or you do not have permission'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # Определение типа элемента по модели
        asset_type = ai_model.model_type  # IMAGE или VIDEO
        
        # Проверяем лимит элементов в сцене
        user_quota = request.user.quota
        current_assets_count = box.assets.count()
        
        if current_assets_count >= user_quota.max_assets_per_box:
            return Response(
                {'detail': f'Достигнут лимит элементов в сцене ({user_quota.max_assets_per_box}). Обратитесь к администратору.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Определение source_type
        from apps.assets.models import Asset
        if parent_asset:
            source_type = Asset.SOURCE_IMG2VID
        else:
            source_type = Asset.SOURCE_GENERATED
        
        try:
            # Автоматически ставим order_index
            next_order_index = box.assets.count()
            # Создание Asset
            from apps.assets.serializers import AssetSerializer
            
            asset_data = {
                'box': box.id,
                'asset_type': asset_type,
                'order_index': next_order_index,
                'prompt_text': prompt,
                'ai_model': ai_model_id,
                'generation_config': request.data.get('generation_config', {}),
                'status': Asset.STATUS_PENDING,
                'source_type': source_type,
            }
            
            if parent_asset:
                asset_data['parent_asset'] = parent_asset.id
            
            # Создаем через serializer для валидации
            serializer = AssetSerializer(data=asset_data)
            serializer.is_valid(raise_exception=True)
            asset = serializer.save()
            
            # Запускаем асинхронную генерацию
            from apps.assets.tasks import start_generation
            start_generation.delay(asset.id)
            
            return Response(
                AssetSerializer(asset).data,
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
        
        POST /api/boxes/{id}/set_headliner/
        
        Принимает:
        - asset_id: ID элемента (обязательно). Передать null для сброса.
        """
        box = self.get_object()
        asset_id = request.data.get('asset_id')

        if asset_id is None:
            box.headliner = None
            box.save(update_fields=['headliner', 'updated_at'])
            return Response(BoxSerializer(box).data)

        from apps.assets.models import Asset
        try:
            asset = Asset.objects.get(id=asset_id, box=box)
        except Asset.DoesNotExist:
            return Response(
                {'error': 'Элемент не найден или не принадлежит этой сцене.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        box.headliner = asset
        box.save(update_fields=['headliner', 'updated_at'])
        return Response(BoxSerializer(box).data)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def reorder(self, request):
        """
        Изменить порядок сцен.
        
        POST /api/boxes/reorder/
        
        Принимает:
        - box_ids: [1, 3, 2, ...] — список ID сцен в новом порядке
        """
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        box_ids = serializer.validated_data['box_ids']

        # Проверяем, что все сцены принадлежат пользователю
        user_box_ids = set(
            Box.objects.filter(
                project__user=request.user,
                id__in=box_ids
            ).values_list('id', flat=True)
        )
        if set(box_ids) != user_box_ids:
            return Response(
                {'error': 'Некоторые сцены не найдены или не принадлежат вам.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reorder_boxes(box_ids)
        return Response({'status': 'ok'})
