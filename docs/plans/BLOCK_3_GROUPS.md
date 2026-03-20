# Блок 3: Группы вместо сцен

> Задачи из agent-tasks.md: #5 (Структура без групп), #6 (Терминология Сцена→Группа)
> Зависимости: Блок 0 (baseline). Это самый крупный блок — требует брейншторм и согласование до начала.
> Область: backend (scenes, elements, projects), frontend (workspace, навигация, stores)

## Цель

Элементы могут жить в проекте без группы. Группы — опциональный инструмент организации с поддержкой вложенности. Терминология: "Сцена" → "Группа" везде в UI.

---

## ⚠️ ПЕРЕД НАЧАЛОМ

Этот блок затрагивает ядро приложения. **Обязательно:**
1. Брейншторм с владельцем — согласовать навигацию, UX
2. ASCII-диаграммы потоков данных — до написания кода
3. Миграции тестировать на копии production БД

---

## Часть A: Backend — модель данных

### Шаг A.1: Сделать Element.scene nullable

**Файл:** `backend/apps/elements/models.py`

```python
scene = models.ForeignKey(
    'scenes.Scene',
    on_delete=models.SET_NULL,  # было CASCADE
    null=True,                   # НОВОЕ
    blank=True,                  # НОВОЕ
    related_name='elements',
    verbose_name='Группа'        # было 'Сцена'
)

# Добавить прямую связь с проектом
project = models.ForeignKey(
    'projects.Project',
    on_delete=models.CASCADE,
    related_name='elements',
    verbose_name='Проект'
)
```

**Миграция:**
1. AddField `project` (nullable сначала)
2. Data migration: заполнить `project` из `element.scene.project`
3. AlterField `project` → NOT NULL
4. AlterField `scene` → nullable

**Критично:** Данные в production. Миграция должна быть в 3 шага (add nullable → backfill → make not null).

### Шаг A.2: Вложенные группы (Scene → Group)

**Файл:** `backend/apps/scenes/models.py`

Добавить parent FK для вложенности:

```python
parent = models.ForeignKey(
    'self',
    on_delete=models.CASCADE,
    null=True,
    blank=True,
    related_name='children',
    verbose_name='Родительская группа'
)
```

Переименовать в коде — **опционально, можно оставить модель Scene но в verbose_name поставить "Группа":**
```python
class Meta:
    verbose_name = 'Группа'
    verbose_name_plural = 'Группы'
```

**НЕ переименовывать таблицу** (`scenes_scene` остаётся) — это безопаснее для production.

### Шаг A.3: Генерация на уровне проекта

**Файл:** `backend/apps/scenes/views.py` (или создать новый endpoint)

Сейчас: `POST /api/scenes/{sceneId}/generate/`
Нужно: `POST /api/projects/{projectId}/generate/` (элемент без группы)

Варианты:
1. **Новый endpoint** на ProjectViewSet — `generate` action
2. Существующий endpoint — если `scene_id` не передан, создать элемент без группы

**Рекомендация:** Вариант 1 — отдельный endpoint. Чище, не ломает существующий контракт.

### Шаг A.4: Upload на уровне проекта

Аналогично: `POST /api/projects/{projectId}/upload/`

### Шаг A.5: Обновить сериализаторы

**Файл:** `backend/apps/elements/serializers.py`

- Добавить `project_id`, `project_name` в ElementSerializer
- `scene` может быть null — `scene_name` = null если нет группы
- Добавить `group_name` (алиас scene_name) для нового UI

**Файл:** `backend/apps/scenes/serializers.py`

- Добавить `parent_id`, `children_count` в SceneSerializer
- Добавить `element_count_ungrouped` в ProjectSerializer (элементы без группы)

---

## Часть B: Frontend — навигация и workspace

### Шаг B.1: Обновить типы

**Файл:** `frontend/lib/types/index.ts`

```typescript
// Scene переименовать в Group (или добавить alias)
interface Group {
  id: number
  project: number
  parent: number | null  // для вложенности
  name: string
  status: GroupStatus
  order_index: number
  headliner: number | null
  element_count: number
  children_count: number
  created_at: string
  updated_at: string
}

// Element обновить
interface Element {
  // ...existing
  scene: number | null  // nullable теперь
  project: number       // новое поле
  group_name: string | null
}
```

### Шаг B.2: Workspace без обязательной группы

**Файл:** `frontend/components/element/SceneWorkspace.tsx`

Сейчас: Workspace привязан к `sceneId`. URL: `/projects/[id]/scenes/[sceneId]/`

Нужно: Workspace на уровне проекта. URL: `/projects/[id]/` (элементы без группы)

Варианты маршрутизации:
```
/projects/[id]/           → workspace проекта (элементы без группы + список групп)
/projects/[id]/groups/[groupId]/ → workspace группы (как сейчас SceneWorkspace)
```

**Решение:** Создать общий WorkspaceContainer, который:
- Если `groupId` задан → показывает элементы группы
- Если нет → показывает элементы проекта (scene=null) + карточки групп

### Шаг B.3: Обновить stores

**Файл:** `frontend/lib/store/scene-workspace.ts`

Переименовать store или добавить поддержку:
- `loadWorkspace(projectId, groupId?)` — если groupId null, грузит элементы проекта
- API: `elementsApi.getByProject(projectId)` (новый) или `elementsApi.getByScene(sceneId)` (существующий)

**Файл:** `frontend/lib/store/generation.ts`

- `generate(projectId, groupId?)` — если groupId null, создаёт элемент на уровне проекта

### Шаг B.4: Навигация

Нужно согласовать с владельцем:
- Как показывать группы в пространстве проекта (карточки? sidebar? breadcrumbs?)
- Как вернуться из группы в проект
- Как показывать вложенные группы

**Варианты:**
1. **Breadcrumbs:** Проект > Группа 1 > Подгруппа 2
2. **Sidebar:** дерево групп слева
3. **Inline карточки:** группы отображаются как "папки" среди элементов

### Шаг B.5: DnD — перемещение элементов между группами

- Элемент можно перетащить на карточку группы → переместить в группу
- Bulk action: "Переместить в группу" → выбор группы из dropdown
- Элемент можно "вынуть" из группы обратно в проект

---

## Часть C: Терминология

### Шаг C.1: Backend verbose_name

**Файлы:** `backend/apps/scenes/models.py`, `admin.py`, сериализаторы

- `verbose_name = 'Группа'`, `verbose_name_plural = 'Группы'`
- Admin: "Группы" вместо "Сцены"

### Шаг C.2: Frontend UI текст

Поиск и замена всех user-facing строк:
- "Сцена" → "Группа"
- "сцены" → "группы"
- "Сценарный стол" → подобрать подходящее название (согласовать)
- "Создать сцену" → "Создать группу"

**Не менять:** Имена файлов, компонентов, переменных в коде (scene остаётся в коде, Group — только в UI).

---

## Чего НЕ делать в этом блоке

- Не менять AI-модели, pricing, credits
- Не менять lightbox (кроме отображения group_name вместо scene_name)
- Не менять шеринг (SharedLink)
- Не удалять модель Scene — только расширять

## Проверка готовности

1. Элемент можно создать (генерация + upload) без группы, на уровне проекта
2. Элемент можно перетащить в группу и обратно
3. Группы могут быть вложенными (группа в группе)
4. Навигация: проект ↔ группа ↔ подгруппа — работает плавно
5. Все user-facing тексты говорят "Группа" вместо "Сцена"
6. Существующие данные (все элементы привязаны к сценам) — работают как раньше
7. Production миграции проходят без потери данных
