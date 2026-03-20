# Блок 4: Метрики и данные проекта

> Задача из agent-tasks.md: #7 (Данные о проекте и группах)
> Зависимости: Блок 3 (структура групп должна быть готова)
> Область: backend (эндпоинты агрегации), frontend (компоненты отображения)

## Цель

Пользователь видит сколько потрачено, сколько элементов, объём памяти — на уровне проекта и группы. Информация доступна, но не давит.

---

## ⚠️ ПЕРЕД НАЧАЛОМ

Дизайн компонентов — через MCP Pen, согласовать до реализации. Этот документ описывает данные и API, финальный UI определяется после согласования дизайна.

---

## Часть A: Backend — агрегация данных

### Шаг A.1: Эндпоинт статистики проекта

**Файл:** `backend/apps/projects/views.py`

Добавить action `stats` на ProjectViewSet:
```
GET /api/projects/{id}/stats/
```

Response:
```json
{
  "total_spent": "125.50",
  "elements_visible": 42,
  "elements_deleted": 7,
  "elements_total_generated": 49,
  "storage_bytes": 1073741824,
  "storage_display": "1.0 ГБ",
  "groups_count": 5,
  "last_generation_cost": "3.00",
  "last_generation_model": "Nano Banana"
}
```

**Логика:**
- `total_spent` — сумма `CreditsTransaction.amount` (reason=generation_debit) для элементов этого проекта. Абсолютное значение (потрачено). Не уменьшается при удалении.
- `elements_visible` — `Element.objects.filter(project=project).count()`
- `elements_deleted` — нужно решить: soft delete или счётчик на проекте? **Рекомендация:** добавить поле `deleted_elements_count` на Project (инкрементировать при удалении).
- `storage_bytes` — сумма размеров файлов. Нужно хранить `file_size` на Element (сейчас не хранится).
- `last_generation_cost` — последний `CreditsTransaction` для этого проекта.

### Шаг A.2: Поле file_size на Element

**Файл:** `backend/apps/elements/models.py`

```python
file_size = models.BigIntegerField(
    null=True,
    blank=True,
    verbose_name='Размер файла (байт)',
)
```

Заполнять:
- При upload: из `file.size`
- При генерации: из `Content-Length` при скачивании результата (в `finalize_generation_success`)

**Миграция:** AddField nullable — безопасно для production.

### Шаг A.3: Счётчик удалённых элементов

**Файл:** `backend/apps/projects/models.py`

```python
deleted_elements_count = models.PositiveIntegerField(default=0)
```

В `ElementViewSet.destroy()` — инкрементировать `project.deleted_elements_count`.

### Шаг A.4: Эндпоинт статистики группы

```
GET /api/scenes/{id}/stats/   (или /api/groups/{id}/stats/)
```

Аналогично проекту, но фильтр по группе.

### Шаг A.5: Баланс пользователя — уже есть

`GET /api/credits/balance/` — уже возвращает `balance`, `pricing_percent`. Дополнительных изменений не нужно.

---

## Часть B: Frontend — отображение метрик

### Шаг B.1: Компонент ProjectStats

**Новый файл:** `frontend/components/project/ProjectStats.tsx`

Компактная панель с метриками:
- Потрачено: 125.50 ₽
- Элементов: 42 (7 удалено)
- Память: 1.0 ГБ
- Групп: 5

**Где показывать:** На странице проекта (header или sidebar). Точное расположение — из согласованного дизайна.

### Шаг B.2: Баланс — постоянно видимый

**Файл:** `frontend/components/layout/Navbar.tsx`

Добавить отображение баланса в navbar:
- Значение из `useCreditsStore.balance`
- Ненавязчиво: мелкий текст или иконка с tooltip
- Обновляется при каждой генерации

### Шаг B.3: Стоимость последней генерации

**Файл:** `frontend/components/generation/PromptBar.tsx` или отдельный компонент

После генерации — кратковременно показать стоимость:
- "Списано: 3.00 ₽" (toast или inline-сообщение)
- Пропадает через 5 секунд

---

## Чего НЕ делать в этом блоке

- Не менять модель данных групп/элементов (кроме file_size и deleted_count)
- Не менять генерацию
- Не менять lightbox
- Не добавлять аналитику/графики (только числовые метрики)

## Проверка готовности

1. `GET /api/projects/{id}/stats/` возвращает корректные данные
2. Метрики проекта отображаются в UI
3. Баланс виден в navbar постоянно
4. Удаление элемента не уменьшает "потрачено"
5. После генерации видно сколько списано
