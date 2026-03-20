# Architecture Constitution

> Единый документ для разработчика, ревьюера и дебагера.  
> Цель: чтобы любой человек мог быстро понять устройство фронтенда, проверить качество реализации и исправлять баги без ломки архитектуры.

## 1) Основные принципы

1. **Thin Pages**  
   Страницы (`app/**/page.tsx`) только принимают route params и собирают контейнеры.  
   Бизнес-логика, API-вызовы, сложные эффекты в page-файлах запрещены.

2. **Слои и однонаправленный поток данных**  
   `Page -> Container Component -> Store -> API -> Backend`  
   UI-компоненты не знают о backend напрямую.

3. **Domain-first Zustand**  
   Состояние делится по доменам (`auth`, `projects`, `scene-workspace`, `generation`).  
   Общий UI-store как свалка не допускается.

4. **Контракт важнее реализации**  
   Сначала фиксируются типы/интерфейсы и сигнатуры действий, потом UI и логика.

5. **Никакой скрытой магии**  
   Динамический UI (параметры модели, image inputs) рендерится строго из backend-схем.

6. **Русский язык в UX**  
   Весь user-facing текст: русский.  
   Идентификаторы кода: английский.

7. **Никаких костылей через UI/try-catch**  
   Ошибки не маскируются пустыми fallback-значениями и "тихими" catch в UI.  
   Исправление идёт через корректный доменный контракт (тип + API + store + backend).

## 2) Слойная архитектура

### Pages (`frontend/app/**`)
- Только композиция компонентов и прокидывание параметров.
- Запрещено: `axios`, прямые вызовы `api/*`, бизнес-логика.

### Components (`frontend/components/**`)
- **Presentational**: только props, без store/api.
- **Container**: подключают store и связывают события.
- Главная точка сборки workspace: `components/element/SceneWorkspace.tsx`.

### Stores (`frontend/lib/store/**`)
- Хранят состояние домена и действия.
- Все side-effects домена (load/update/reorder/generate) — здесь.
- Мутации через optimistic update + rollback.

### API (`frontend/lib/api/**`)
- Тонкая typed-прослойка над `apiClient`.
- Один backend-ресурс = один api-модуль.
- Нормализация ошибок через `normalizeError`.

### Types (`frontend/lib/types/index.ts`)
- Single source of truth для API-контрактов и shared-типов.
- Любая смена backend serializer shape сначала отражается здесь.

## 3) Инварианты (нельзя нарушать)

1. **Правильные endpoint-контракты**
   - Generate: `POST /api/scenes/{sceneId}/generate/`
   - Upload: `POST /api/scenes/{sceneId}/upload/`
   - Set headliner: `POST /api/scenes/{sceneId}/set_headliner/`
   - Reorder elements: `POST /api/elements/reorder/`

2. **AIModel schema-driven UI**
   - `parameters_schema` = массив параметров.
   - `image_inputs_schema` = источник кнопок image input.
   - Никаких хардкодов "лишних" контролов.

3. **Workspace composition**
   - Zone 1: ConfigPanel
   - Zone 2: PromptBar
   - Zone 3: Element canvas
   - Zone 4: Lightbox

4. **WebSocket события**
   - `element_status_changed` обязано обновлять store и UI-состояние карточек.

5. **Toasts**
   - Только `sonner`.
   - Короткие сообщения на русском.

6. **Контракты данных и жизненный цикл состояний**
   - UI получает и отображает только валидные данные, гарантированные контрактом.
   - Статусы сущностей должны отражать реальный этап жизненного цикла, а не служить "заглушкой".
   - Временные UI-состояния (optimistic/pending/loading) оформляются как явная часть модели состояния.

7. **Действия пользователя и UX-консистентность**
   - Для каждого действия есть один явный источник истины (store-action), без дублирующих сценариев.
   - Потенциально опасные действия требуют явного подтверждения.
   - Массовые операции должны быть атомарными на уровне UX (единый сценарий подтверждения/результата).

8. **Детерминированный рендер и гидратация**
   - Первый рендер должен быть предсказуемым и не зависеть от недетерминированных клиентских источников.
   - Любое чтение browser-only API выполняется только в корректной фазе клиента.
   - Нельзя допускать SSR/CSR расхождений в критичных ветках (auth, routing, layout).

## 4) Правила для ревьюера

## Быстрый чеклист PR

- [ ] В page-файлах нет бизнес-логики/API-вызовов.
- [ ] Компоненты не лезут напрямую в `apiClient`.
- [ ] Store-экшены имеют rollback при optimistic update.
- [ ] Типы в `lib/types/index.ts` совпадают с backend serializer.
- [ ] Динамические формы реально строятся по schema.
- [ ] Тексты и ошибки в UI на русском.
- [ ] Нет новых дубликатов state между store-модулями.
- [ ] Не добавлены лишние зависимости без причины.
- [ ] Ошибки не маскируются в UI; фиксы идут через корректный слой и контракт.
- [ ] Массовые операции реализованы как единый сценарий, а не серия несвязанных действий.
- [ ] Первый рендер и гидратация детерминированы (без client-only branching в initial render).

## Красные флаги

- API-запрос из `components/**` в обход store.
- `any` в контрактах вместо точного интерфейса.
- Логика в page вместо container/store.
- Хардкод параметров моделей, не основанный на schema.
- Дублирование `selected*`, `filter`, `lightbox*` в нескольких store.
- Маскировка контрактной проблемы в UI через fallback вместо исправления источника данных.
- Дублирующие или конфликтующие обработчики одного и того же пользовательского действия.
- Недетерминированный initial render, приводящий к SSR/CSR mismatch.

## 5) Правила для дебагера

## Порядок диагностики бага

1. **Определи слой**, где ломается:
   - Rendering/UI
   - Store state transition
   - API contract/request payload
   - Backend response/serializer
   - WebSocket event flow

2. **Проверь входной контракт**:
   - Какие данные пришли из backend?
   - Соответствуют ли они типам в `lib/types/index.ts`?

3. **Проверь store action**:
   - Выполняется ли optimistic update?
   - Есть ли rollback на ошибке?
   - Не теряется ли сортировка/selection/filter state?

4. **Проверь UI-отображение**:
   - Компонент получает нужные props?
   - Нет ли расхождения между `filteredElements` и фактическим render?

5. **Проверь WS (если realtime баг)**:
   - Есть ли подключение?
   - Приходит ли `element_status_changed`?
   - Обновляется ли store по событию?

## Мини-протокол фикса

- Исправляй в **самом нижнем корректном слое** (не маскируй баг в UI, если сломан контракт).
- После фикса добавь/обнови тип или guard, чтобы баг не повторился.
- Если баг архитектурный (не локальный), сначала обнови контракт/правило, потом код.

## 6) Определение “Done” для фичи

Фича считается завершенной только если:

1. Поведение соответствует плану и UX-сценарию.
2. Не нарушены инварианты и слои.
3. Типы и backend-контракты согласованы.
4. Ошибки обрабатываются предсказуемо (toast + rollback где нужно).
5. Нет регрессий в соседних зонах workspace.

## 7) Набор обязательных документов

- Архитектурный план: `.cursor/plans/frontend_architecture_plan_44152b55.plan.md`
- Декомпозиция задач: `.cursor/tasks/DECOMPOSITION.md`
- Правило фазы 6–9: `.cursor/rules/phase-6-9-architecture.mdc`
- Эта конституция: `.cursor/ARCHITECTURE_CONSTITUTION.md`

## 8) Backend: управление ресурсами (Celery / Daphne / Nginx)

### Upload pipeline (deferred S3 upload)

**Daphne НЕ загружает файлы в S3 синхронно.** Upload view работает мгновенно (~1 сек):
1. `save_to_staging(file)` → сохраняет файл на локальный диск (`/app/tmp_uploads/`)
2. Создаёт Element со `status=PROCESSING`, без `file_url`
3. Enqueue `process_uploaded_file.delay(element_id, staging_path)` → Celery FIFO
4. Возвращает Element сразу

Celery-задача `process_uploaded_file` (FIFO, concurrency=2):
1. `upload_staging_to_s3(staging_path, ...)` → загрузка в S3
2. Для IMAGE: `thumbnail_url = file_url`
3. Для VIDEO: `generate_video_thumbnail_from_path(staging_path, ...)`
4. `status = COMPLETED`, WS-уведомление
5. Удаление staging-файла

**Запрещено**: синхронная загрузка в S3 из Django view. Это блокирует Daphne threads на 30-60 сек.

### Celery worker safety

- Concurrency жёстко ограничена: `--concurrency=2 --max-memory-per-child=300000` (во всех docker-compose файлах).
- Prefetch multiplier = 1 (`CELERY_WORKER_PREFETCH_MULTIPLIER = 1` в settings.py) — worker не забирает задачи впрок.
- Soft time limit = 5 мин (`CELERY_TASK_SOFT_TIME_LIMIT = 300`) — предотвращает зависание задач.
- **Запрещено** загружать файлы целиком в RAM внутри задач. Использовать streaming (`requests.get(..., stream=True)`) + запись во временный файл.

### Shared staging volume

В production (`docker-compose.production.yml`) backend и celery контейнеры разделяют Docker volume `upload_staging`, монтированный в `/app/tmp_uploads/`. В dev все контейнеры монтируют `./backend:/app`, поэтому staging-директория доступна автоматически.

### Thumbnail-генерация (видео)

- Основная функция: `generate_video_thumbnail_from_path(video_path, ...)` в `s3_utils.py` — работает с файлом на диске, не потребляет RAM под видео.
- `generate_video_thumbnail_from_bytes` сохранена как обёртка для обратной совместимости.
- `ffmpeg` обязателен в production Dockerfile.

### Nginx / upload limits

- `/api/` location имеет `client_max_body_size 100M`, `proxy_read_timeout 300s`, `proxy_send_timeout 300s`.

## 9) Frontend: очистка ресурсов при навигации

- `SceneWorkspace` при unmount вызывает `resetWorkspace()`, который:
  - Отменяет очередь загрузок (abort + revoke blob URLs)
  - Сбрасывает весь store-стейт (scene, elements, selection, lightbox, filter)
- В grid **никогда не рендерятся `<video>` элементы**. Для видео без thumbnail показывается статический placeholder (иконка). Это предотвращает утечку памяти через DOM.
- **Превью при загрузке**: при `enqueueUploads` для видео-файлов клиентская функция `captureVideoFrame(file)` извлекает один кадр через скрытый `<video>` + canvas → data URL JPEG 320px. Для изображений превью — это сам blob URL файла.
- **Blob URL lifecycle**: управляется store, а не upload queue. `updateElement` ревокает old blob URL при получении real S3 URL. `removeElement` и `resetWorkspace` ревокают blob URLs при удалении элементов. `_replaceOptimistic` сохраняет blob URL если server element ещё не имеет `file_url` (deferred upload).
- `cancelUploadQueue()` не сбрасывает `isProcessingQueue` напрямую — флаг сбрасывается внутри `processUploadQueue` после выхода из цикла, чтобы исключить race condition.

## 10) Практика изменений

При любом изменении:

1. Сначала проверь, не ломает ли оно текущие контракты.
2. Если меняется backend shape -> сначала обнови `lib/types/index.ts`.
3. Если меняется архитектурный паттерн -> зафиксируй в `.cursor/rules/*.mdc`.
4. Если меняется порядок работ или ownership -> обнови `DECOMPOSITION.md`.

