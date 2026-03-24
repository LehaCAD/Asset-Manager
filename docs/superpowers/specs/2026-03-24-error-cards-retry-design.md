# Error Cards + Retry UX — Design Spec

> Дата: 2026-03-24
> Статус: утверждён
> Область: frontend (ElementCard, generation store, scene-workspace store)
> Мокапы: `pen/pencil-new.pen` → фрейм "Error Cards UX Variants" → секция "Гибрид B+C"

## Проблема

Два пути ошибок генерации работают по-разному:

1. **HTTP 400/500** (синхронная ошибка) — optimistic карточка удаляется, показывается toast. Юзер уходит, возвращается — пусто, ни следа ошибки.
2. **Celery/провайдер** (асинхронная ошибка) — Element сохраняется в БД со статусом FAILED, карточка остаётся с красным overlay.

Ни один из конкурентов (Leonardo.ai, RunwayML, Midjourney) не предлагает retry с карточки — это наш UX-выигрыш.

## Решение

### 1. Унификация путей ошибок

При HTTP 400/500 вместо `discardOptimisticGeneration(tempId)` вызывать `updateElement(tempId, { status: "FAILED", error_message })`. Карточка остаётся в grid.

**Файл:** `frontend/lib/store/generation.ts` → `generate()` catch-блок

**Нюанс:** optimistic элемент с отрицательным tempId живёт только в памяти. При перезагрузке пропадёт. Это ок — деньги не списались, элемент не создан на бэкенде.

### 2. Error Card — Default State (без hover)

Карточка того же размера что обычная. Структура:

```
┌─────────────────────────────┐
│                             │
│     (!) AlertCircle         │  bg: red-500/10
│   "Генерация не удалась"    │  icon: red-500/25, text: white/20
│                             │
├─────────────────────────────┤
│ ● Ошибка · Kling 2.0       │  bg: red-500/20
│ Content policy violation... │  error_message truncated
│                     [↻ Повторить] │  mini retry button
└─────────────────────────────┘
```

**Info bar (нижняя часть):**
- Левая колонка:
  - Строка 1: красная точка (6px) + "Ошибка" (bold, `text-red-400`) + "·" + `ai_model_name` (`text-white/40`)
  - Строка 2: `error_message` truncated одной строкой (`text-white/40`, text-[10px])
- Правая часть: кнопка "Повторить" (`bg-white/15`, rounded, иконка `rotate-ccw` + текст)

**Верхняя зона:**
- Фон: `bg-red-500/10` (fill_container по высоте)
- Центр: иконка `AlertCircle` 36px в `text-red-500/25` + текст "Генерация не удалась" в `text-white/20`

**Что НЕ показываем:** кнопку Download (скачивать нечего), кнопку Favorite (нет смысла).

### 3. Error Card — Hover State

Поверх всей карточки (z-20, как у обычных карточек):

```
┌─────────────────────────────┐
│                             │
│   ● Ошибка генерации        │  bg-black/80
│   Content policy violation  │
│                             │
│   [  ↻ Повторить  ]        │  white bg, primary action
│      ⌫ Удалить              │  bg-white/15, secondary
│                             │
└─────────────────────────────┘
```

- Scrim: `bg-black/80`
- Центр (вертикальный flex, gap-12, aligned center):
  - Красная точка + "Ошибка генерации" (text-red-400, font-medium)
  - `error_message` полный текст (text-white/50, text-center, max-w ограничен)
  - Кнопка "Повторить": белый фон, чёрный текст, иконка rotate-ccw, padding 10px 28px, rounded-md
  - Кнопка "Удалить": bg-white/15, text-white/60, иконка trash-2, padding 6px 16px

### 4. Retry Action (shared)

Единая функция retry, используемая из:
- ElementCard (hover кнопка + mini кнопка в bar)
- DetailPanel (кнопка "Повторить запрос")

**Логика:**
1. Найти модель: `availableModels.find(m => m.id === element.ai_model)`
2. Если не найдена → `toast.error("Модель недоступна")`; return
3. `selectModel(model)` — загружает defaults и image_inputs_schema
4. `setPrompt(element.prompt_text)`
5. Восстановить параметры: для каждого ключа в `generation_config` (кроме `_debit_amount`, `_debit_transaction`, `input_urls`) → `setParameter(key, value)`
6. Если в лайтбоксе → `closeLightbox()`
7. `toast.success("Параметры загружены")`

**Размещение:** вынести в хелпер или action в generation store, чтобы не дублировать между ElementCard и DetailPanel.

### 5. Что НЕ входит в эту задачу

- Восстановление image inputs (S3 URLs → image input entries) — отдельная задача
- Bulk delete failed cards — отдельная задача
- Автоудаление failed cards по таймеру — не делаем (никто не делает)
- Изменение backend/моделей данных — не нужно

## Файлы для изменения

| Файл | Что делать |
|------|-----------|
| `frontend/components/element/ElementCard.tsx` | Новый error overlay (default + hover) с retry |
| `frontend/lib/store/generation.ts` | 1) catch-блок: FAILED вместо discard. 2) Shared retry action |
| `frontend/components/lightbox/DetailPanel.tsx` | Использовать shared retry вместо inline логики |

## Проверка готовности

1. HTTP 400/500 при генерации → карточка остаётся с красным error state
2. Celery FAILED → карточка показывает error state (как раньше, но с новым UI)
3. Error card default: видна ошибка, причина, модель, кнопка "Повторить"
4. Error card hover: крупные кнопки "Повторить" + "Удалить"
5. Retry загружает модель + промпт + параметры → закрывает лайтбокс
6. Retry с недоступной моделью → toast "Модель недоступна"
7. Обычные карточки не затронуты
