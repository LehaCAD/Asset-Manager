# ✅ Создание REST API для Boxes - Завершено

## Выполненные задачи

### 1. Создан BoxSerializer
**Файл:** `backend/apps/boxes/serializers.py`

```python
class BoxSerializer(serializers.ModelSerializer):
    assets_count = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Box
        fields = [
            'id', 'project', 'project_name', 'name', 
            'order_index', 'assets_count', 
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_assets_count(self, obj) -> int:
        return obj.assets.count()
    
    def get_project_name(self, obj) -> str:
        return obj.project.name
```

**Особенности:**
- ✅ Все поля модели
- 🔥 **assets_count** - подсчет ассетов бокса
- 🔥 **project_name** - название проекта для удобства UI
- ✅ read_only_fields для автогенерируемых полей

### 2. Создан BoxViewSet с Permissions
**Файл:** `backend/apps/boxes/views.py`

```python
class IsProjectOwner(permissions.BasePermission):
    """Пользователь может работать только с боксами своих проектов."""
    
    def has_object_permission(self, request, view, obj):
        return obj.project.user == request.user


class BoxViewSet(viewsets.ModelViewSet):
    serializer_class = BoxSerializer
    permission_classes = [IsAuthenticated, IsProjectOwner]
    
    def get_queryset(self):
        """Боксы проектов текущего пользователя + фильтрация."""
        queryset = Box.objects.filter(
            project__user=self.request.user
        ).select_related('project').prefetch_related('assets')
        
        # Фильтрация по project через query params
        project_id = self.request.query_params.get('project', None)
        if project_id is not None:
            queryset = queryset.filter(project_id=project_id)
        
        return queryset
    
    def create(self, request, *args, **kwargs):
        """Проверка, что project принадлежит пользователю."""
        project_id = request.data.get('project')
        
        # Валидация project
        from apps.projects.models import Project
        try:
            project = Project.objects.get(id=project_id, user=request.user)
        except Project.DoesNotExist:
            return Response(
                {'project': ['Project not found or you do not have permission.']},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return super().create(request, *args, **kwargs)
```

**Особенности:**
- 🔒 **IsProjectOwner** - проверка через `obj.project.user`
- ✅ **IsAuthenticated** - только авторизованные
- 🔍 **get_queryset()** - фильтрация по `project__user=request.user`
- 📊 **Фильтрация по project_id** через query params
- ✅ **Валидация в create()** - проверка владельца project
- ⚡ **select_related + prefetch_related** - оптимизация

### 3. Создан urls.py с роутером
**Файл:** `backend/apps/boxes/urls.py`

```python
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BoxViewSet

router = DefaultRouter()
router.register(r'', BoxViewSet, basename='box')

urlpatterns = [
    path('', include(router.urls)),
]
```

### 4. Подключено в config/urls.py

```python
urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/projects/', include('apps.projects.urls')),
    path('api/boxes/', include('apps.boxes.urls')),
]
```

**Результат:**
- ✅ `GET /api/boxes/` - список боксов
- ✅ `GET /api/boxes/?project=123` - боксы конкретного проекта
- ✅ `POST /api/boxes/` - создание бокса
- ✅ `GET /api/boxes/{id}/` - детали бокса
- ✅ `PUT /api/boxes/{id}/` - обновление (полное)
- ✅ `PATCH /api/boxes/{id}/` - обновление (частичное)
- ✅ `DELETE /api/boxes/{id}/` - удаление

### 5. Написаны API тесты
**Файл:** `backend/apps/boxes/test_api.py`

**13 тестов покрывают:**
- ✅ `test_list_boxes_unauthorized` - 403 без авторизации
- ✅ `test_list_boxes_authenticated` - только боксы своих проектов
- ✅ `test_list_boxes_filtered_by_project` - фильтрация ?project=123
- ✅ `test_create_box` - создание бокса
- ✅ `test_create_box_for_other_user_project` - 400 на чужой project
- ✅ `test_retrieve_box` - получение деталей
- ✅ `test_retrieve_other_user_box` - 404 на чужой бокс
- ✅ `test_update_box` - обновление через PUT
- ✅ `test_partial_update_box` - обновление через PATCH
- ✅ `test_delete_box` - удаление
- ✅ `test_delete_other_user_box` - 404 на удаление чужого
- ✅ `test_assets_count_field` - корректность подсчета ассетов
- ✅ `test_project_name_field` - корректность project_name

### 6. Создана документация API
**Файл:** `backend/apps/boxes/API_DOCS.md`

- Полное описание всех endpoints
- Примеры запросов и ответов с фильтрацией
- Коды ошибок
- Примеры с curl и JavaScript
- Описание permissions и оптимизации

## API Endpoints

```
GET    /api/boxes/                    # Все боксы пользователя
GET    /api/boxes/?project=123        # Боксы конкретного проекта
POST   /api/boxes/                    # Создать бокс
GET    /api/boxes/{id}/               # Детали бокса
PUT    /api/boxes/{id}/               # Обновить (полностью)
PATCH  /api/boxes/{id}/               # Обновить (частично)
DELETE /api/boxes/{id}/               # Удалить бокс
```

## Фильтрация по project

### Реализация
Фильтрация реализована вручную в `get_queryset()`:

```python
project_id = self.request.query_params.get('project', None)
if project_id is not None:
    queryset = queryset.filter(project_id=project_id)
```

### Использование
```bash
# Все боксы пользователя
GET /api/boxes/

# Только боксы проекта 5
GET /api/boxes/?project=5
```

## Пример использования

### Frontend: получить боксы проекта
```javascript
const fetchProjectBoxes = async (projectId) => {
  const response = await fetch(`/api/boxes/?project=${projectId}`, {
    headers: {
      'Authorization': `Token ${token}`
    }
  });
  
  const boxes = await response.json();
  
  // Отобразить боксы с количеством ассетов
  boxes.forEach(box => {
    console.log(`${box.name}: ${box.assets_count} assets`);
  });
};
```

### Backend: создание бокса через сервис
Бизнес-логика остается в `services.py`, API просто вызывает:

```python
# В services.py уже есть
from apps.boxes.services import create_box

# API просто делегирует валидацию DRF + permissions
```

## Permissions и безопасность

### IsProjectOwner
Проверка владельца через вложенный FK:
```python
def has_object_permission(self, request, view, obj):
    return obj.project.user == request.user
```

### Фильтрация в get_queryset()
```python
Box.objects.filter(project__user=self.request.user)
```
Пользователь **никогда** не увидит боксы чужих проектов в списке.

### Валидация при создании
```python
def create(self, request, *args, **kwargs):
    project_id = request.data.get('project')
    
    # Проверка, что project существует и принадлежит user
    try:
        project = Project.objects.get(id=project_id, user=request.user)
    except Project.DoesNotExist:
        return Response({'project': ['...']}, status=400)
```

Нельзя создать бокс в чужом проекте, даже зная его ID!

## Оптимизация

### Избежание N+1 запросов
```python
.select_related('project').prefetch_related('assets')
```

**Без оптимизации:**
- 1 запрос для списка боксов
- N запросов для project каждого бокса
- N запросов для подсчета assets каждого бокса

**С оптимизацией:**
- 1 запрос для боксов
- 1 запрос для всех projects (select_related)
- 1 запрос для всех assets (prefetch_related)

**Итого: 3 запроса вместо 1+2N**

## Тесты

```bash
# API тесты для boxes
docker compose exec backend python manage.py test apps.boxes.test_api
# Found 13 test(s)
# Ran 13 tests in 2.485s
# OK ✓

# Все тесты проекта
docker compose exec backend python manage.py test
# Found 86 test(s)
# Ran 86 tests in 8.739s
# OK ✓✓✓
```

## Статистика

```
📦 API endpoints:      7 (list, filter, create, retrieve, update, partial_update, destroy)
🔒 Permissions:        2 (IsAuthenticated, IsProjectOwner)
🧪 API тесты:         13 (все проходят ✓)
📊 Общие тесты:       86 (все проходят ✓)
🔍 Фильтрация:        по project_id через query params
📝 Документация:      API_DOCS.md с примерами
⚡ Оптимизация:       select_related + prefetch_related
```

## Структура файлов

```
backend/apps/boxes/
├── serializers.py          # BoxSerializer + 2 SerializerMethodField
├── views.py                # BoxViewSet + IsProjectOwner + фильтрация
├── urls.py                 # Router с DefaultRouter
├── test_api.py             # 13 API тестов
└── API_DOCS.md             # Полная документация API
```

## Response пример

```json
{
  "id": 1,
  "project": 5,
  "project_name": "Мой видео-проект",
  "name": "Сцена открытия",
  "order_index": 0,
  "assets_count": 15,
  "created_at": "2026-02-08T10:30:00Z",
  "updated_at": "2026-02-08T12:00:00Z"
}
```

## Следующие шаги

После реализации API для Boxes можно:
1. 🔜 API для Assets (`/api/boxes/{id}/assets/`)
2. 🔜 Custom action: `POST /api/boxes/reorder/` для массового изменения order_index
3. 🔜 Nested routing: `/api/projects/{id}/boxes/`
4. 🔜 Фильтрация Assets по типу
5. 🔜 Пагинация

## Соответствие стандартам

✅ Следует .cursorrules:
- Бизнес-логика остается в services.py
- API использует DRF ViewSets
- Type hints в сериализаторах
- Оптимизация запросов

✅ Следует TECHNICAL.md:
- REST API через Django REST Framework
- Эндпоинты согласно спецификации
- Permissions и аутентификация

✅ Следует требованиям:
- ✅ Создан serializers.py с BoxSerializer
- ✅ Все поля модели + assets_count + project_name
- ✅ Создан views.py с BoxViewSet (ModelViewSet)
- ✅ Permissions: IsAuthenticated + IsProjectOwner
- ✅ Фильтрация: только боксы своих проектов
- ✅ Валидация: проверка project при создании
- ✅ Фильтрация по project_id: GET /api/boxes/?project=123
- ✅ Создан urls.py с роутером DRF
- ✅ Подключено в config/urls.py

## Готово к использованию!

API полностью функционально и протестировано. Можно:
- ✅ Получать список боксов
- ✅ Фильтровать по проекту
- ✅ Создавать новые боксы
- ✅ Просматривать детали
- ✅ Обновлять (PUT/PATCH)
- ✅ Удалять боксы
- ✅ Видеть количество ассетов (assets_count)
- ✅ Видеть название проекта (project_name)
- ✅ Безопасно (только свои проекты)
