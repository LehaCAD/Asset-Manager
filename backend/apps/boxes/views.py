from rest_framework import viewsets, permissions, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import Box
from .serializers import BoxSerializer, ReorderSerializer
from .services import reorder_boxes
from .s3_utils import upload_file_to_s3, detect_asset_type


class IsProjectOwner(permissions.BasePermission):
    """Пермишен: пользователь может работать только с боксами своих проектов."""
    
    def has_object_permission(self, request, view, obj):
        return obj.project.user == request.user


class BoxViewSet(viewsets.ModelViewSet):
    """
    ViewSet для CRUD операций с боксами.
    
    list: Получить список боксов пользователя (с фильтрацией по project)
    create: Создать новый бокс
    retrieve: Получить детали бокса
    update: Обновить бокс (PUT)
    partial_update: Частично обновить бокс (PATCH)
    destroy: Удалить бокс
    """
    serializer_class = BoxSerializer
    permission_classes = [IsAuthenticated, IsProjectOwner]
    
    def get_queryset(self):
        """Возвращает только боксы проектов текущего пользователя с фильтрацией."""
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
        Переопределяем create для проверки, что project принадлежит пользователю.
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
        
        # Определение типа ассета по расширению
        asset_type = detect_asset_type(file.name)
        
        try:
            # Загрузка файла на S3
            file_url, filename = upload_file_to_s3(file, folder='uploads')
            
            # Создание Asset
            from apps.assets.models import Asset
            from apps.assets.serializers import AssetSerializer
            
            asset_data = {
                'box': box.id,
                'asset_type': asset_type,
                'file_url': file_url,
                'prompt_text': request.data.get('prompt_text', ''),
                'is_favorite': request.data.get('is_favorite', False),
            }
            
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
        Запустить AI генерацию ассета.
        
        POST /api/boxes/{id}/generate/
        
        Принимает:
        - prompt: текст промпта (обязательно)
        - ai_model_id: ID AI модели (обязательно)
        - generation_config: параметры генерации (опционально, dict)
        - parent_asset_id: ID родительского ассета для img2vid (опционально)
        
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
        
        # Проверка родительского ассета (если указан)
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
        
        # Определение типа ассета по модели
        asset_type = ai_model.model_type  # IMAGE или VIDEO
        
        # Определение source_type
        from apps.assets.models import Asset
        if parent_asset:
            source_type = Asset.SOURCE_IMG2VID
        else:
            source_type = Asset.SOURCE_GENERATED
        
        try:
            # Создание Asset
            from apps.assets.serializers import AssetSerializer
            
            asset_data = {
                'box': box.id,
                'asset_type': asset_type,
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
        Назначить хедлайнера для бокса.
        
        POST /api/boxes/{id}/set_headliner/
        
        Принимает:
        - asset_id: ID ассета (обязательно). Передать null для сброса хедлайнера.
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
                {'error': 'Ассет не найден или не принадлежит этому боксу.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        box.headliner = asset
        box.save(update_fields=['headliner', 'updated_at'])
        return Response(BoxSerializer(box).data)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def reorder(self, request):
        """
        Изменить порядок боксов.
        
        POST /api/boxes/reorder/
        
        Принимает:
        - box_ids: [1, 3, 2, ...] — список ID боксов в новом порядке
        """
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        box_ids = serializer.validated_data['box_ids']

        # Проверяем, что все боксы принадлежат пользователю
        user_box_ids = set(
            Box.objects.filter(
                project__user=request.user,
                id__in=box_ids
            ).values_list('id', flat=True)
        )
        if set(box_ids) != user_box_ids:
            return Response(
                {'error': 'Некоторые боксы не найдены или не принадлежат вам.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reorder_boxes(box_ids)
        return Response({'status': 'ok'})
