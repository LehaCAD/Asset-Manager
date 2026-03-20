# Блок 5: Превью, статусы и воспроизведение запроса

> Задачи из agent-tasks.md: #9 (Превью), #10 (Лайтрум: воспроизведение запроса)
> Зависимости: Блок 0 (baseline)
> Область: backend (tasks, generation), frontend (ElementCard, LightboxModal, DetailPanel)

## Цель

Элементы в grid показывают чёткие статусы во время генерации/загрузки. Видео имеют thumbnail. В лайтбоксе можно посмотреть параметры генерации и воспроизвести запрос.

---

## Часть A: Thumbnail для видео

### Шаг A.1: Убедиться что thumbnail генерируется

**Файл:** `backend/apps/elements/tasks.py`

Проверить:
1. При загрузке видео — `generate_video_thumbnail_from_path()` вызывается в `process_uploaded_file` task.
2. При генерации видео — `generate_video_thumbnail_from_path()` вызывается в `finalize_generation_success()`.

**Файл:** `backend/apps/common/generation.py`

В `finalize_generation_success`:
- Если элемент VIDEO и file_url заканчивается на `.mp4`/`.webm`:
  - Скачать файл во temp
  - `generate_video_thumbnail_from_path(temp_path, ...)` → S3 URL
  - Записать в `element.thumbnail_url`

**Проверить:** Что `ffmpeg` доступен в production Docker image. Если нет — добавить в Dockerfile.

### Шаг A.2: Fallback если thumbnail не сгенерировался

**Файл:** `frontend/components/element/ElementCard.tsx`

Если `thumbnail_url` пуст и `element_type === 'VIDEO'`:
- Показать статический placeholder (иконка видео)
- **Не** рендерить `<video>` в grid (правило из ARCHITECTURE_CONSTITUTION)

---

## Часть B: Статусы на карточках

### Шаг B.1: Overlay статуса на ElementCard

**Файл:** `frontend/components/element/ElementCard.tsx`

Добавить overlay снизу карточки (стиль Frame.io):

**Для генерации (source_type=GENERATED):**
- `PENDING` → "Ожидание..." + spinner
- `PROCESSING` → "Генерация: {model_name}" + elapsed time + spinner
- `COMPLETED` → ничего (обычная карточка)
- `FAILED` → "Ошибка" + красный индикатор

**Для загрузки (source_type=UPLOADED):**
- `PROCESSING` → "Загрузка..." + progress (если доступен) + spinner
- `COMPLETED` → ничего

**Информация на overlay:**
- Название модели (из `ai_model_name` или `generation_config`)
- Время генерации (elapsed с момента создания)
- Для failed — кнопка "Подробнее" (показать error_message)

### Шаг B.2: Elapsed time

**Файл:** `frontend/components/element/ElementCard.tsx`

Для элементов в статусе PENDING/PROCESSING:
- Отсчитывать время с `created_at`
- Обновлять каждую секунду (setInterval)
- Формат: "0:15", "1:30", "5:00"
- Cleanup interval при unmount или смене статуса

---

## Часть C: Видео в лайтбоксе — состояние "в процессе"

### Шаг C.1: Корректное отображение незавершённого видео

**Файл:** `frontend/components/lightbox/LightboxModal.tsx`

Сейчас: если `file_url` пуст, видео не отображается (или ломается).

Нужно:
- Если `status !== 'COMPLETED'` → показать placeholder с текстом:
  - PENDING: "Ожидание генерации..."
  - PROCESSING: "Генерация видео... {elapsed}"
  - FAILED: "Ошибка генерации: {error_message}"
- Если `status === 'COMPLETED'` и `file_url` есть → показать видео-плеер
- Если `status === 'COMPLETED'` и `file_url` пуст → "Файл недоступен"

---

## Часть D: Воспроизведение запроса (Лайтрум)

### Шаг D.1: Данные для воспроизведения

**Файл:** `frontend/components/lightbox/DetailPanel.tsx`

DetailPanel уже показывает метаданные элемента. Расширить:

Для сгенерированных элементов показать:
- **Модель:** `ai_model_name`
- **Промпт:** `prompt_text`
- **Параметры:** все ключи из `generation_config` (кроме служебных `_debit_amount`, `input_urls`)
  - Отображать как key-value пары с human-readable labels
- **Seed:** если есть
- **Стоимость:** `generation_config._debit_amount` если есть

### Шаг D.2: Кнопка "Повторить запрос"

**Файл:** `frontend/components/lightbox/DetailPanel.tsx`

Добавить кнопку "Повторить":
1. При клике:
   - `selectModel()` с `ai_model` элемента (если модель ещё существует)
   - `setPrompt()` с `prompt_text`
   - Заполнить параметры из `generation_config`
   - Закрыть лайтбокс
2. Если модель больше не доступна — показать tooltip "Модель недоступна"

### Шаг D.3: Бэкенд — сохранять достаточно данных

**Файл:** `backend/apps/elements/tasks.py`

Проверить что `generation_config` на Element содержит:
- Все параметры, которые были отправлены в запросе
- `ai_model_id` (уже есть как FK)
- `prompt_text` (уже есть как поле)
- seed (если провайдер возвращает — сохранить)

Если seed приходит в ответе провайдера — извлечь и записать в `element.seed`.

---

## Чего НЕ делать в этом блоке

- Не менять модель данных групп/проектов
- Не менять admin AI-моделей
- Не менять PromptBar / ConfigPanel
- Не менять credits логику
- Не оптимизировать рендеринг grid (это отдельная задача)

## Проверка готовности

1. Видео имеют thumbnail в grid (первый кадр)
2. Карточки PENDING/PROCESSING показывают overlay с моделью и временем
3. Карточки FAILED показывают ошибку
4. В лайтбоксе незавершённое видео показывает placeholder, а не ломается
5. В DetailPanel видны все параметры генерации
6. Кнопка "Повторить" заполняет PromptBar + параметры и закрывает лайтбокс
7. Элементы, загруженные пользователем (UPLOADED), не показывают параметры генерации
