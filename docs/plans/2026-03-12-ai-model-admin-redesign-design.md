# AI Model Admin Redesign Design

## Implementation Status

- Contract boundary between legacy and compiled runtime artifacts is implemented.
- Normalized parameter, binding, pricing, compiler, validator, admin workflow, and backfill layers are implemented.
- Runtime compatibility for compiled `parameters_schema` and compiled pricing is implemented.
- Remaining blocker is full-suite verification of `apps.scenes.test_api`, which is currently impeded by test database runner state outside the AI admin redesign logic.

**Дата:** 2026-03-12

**Проблема**

Текущая конфигурация AI-моделей в проекте перегружена и хрупка. В одной сущности `AIModel` смешаны:
- transport-контракт к провайдеру (`request_schema`);
- UI-контракт (`parameters_schema`, `image_inputs_schema`, `ui_semantic`);
- pricing-контракт (`pricing_schema`).

Из-за этого один и тот же смысл параметра размазан между несколькими представлениями, а администрирование требует ручной синхронизации и больших JSON-блоков.

Текущее состояние видно в:
- `backend/apps/ai_providers/models.py`
- `backend/apps/ai_providers/admin.py`
- `backend/apps/credits/services.py`
- `backend/apps/ai_providers/management/commands/setup_kie_ai.py`
- `backend/apps/ai_providers/tests.py`

## Цели

- Оставить `AIModel` центральной сущностью администрирования.
- Убрать ручную синхронизацию между request/UI/pricing.
- Снизить зависимость от огромных JSON в админке.
- Сохранить advanced mode для нестандартных моделей.
- Сделать настройку цен удобной и для маленьких, и для больших матриц.
- Сохранить обратную совместимость на переходном этапе.

## Не-цели

- Не менять текущую схему рендера фронтенда в лоб, если можно сохранить compiled shape.
- Не превращать систему в тяжёлый ERP из десятков обязательных сущностей.
- Не убирать raw JSON полностью.

## Ключевое решение

`AIModel` остаётся главным экраном и главной административной точкой входа, но перестаёт быть местом, где руками собирается весь смысл модели.

Нормализованные сущности выносятся под капот:
- `CanonicalParameter` — источник истины для канонического смысла параметра;
- `ModelParameterBinding` — связь между placeholder/provider field и каноническим параметром в рамках конкретной модели;
- `PricingProfile` или `ModelPricingConfig` — управляемая конфигурация цен;
- compiled artifacts — производные JSON для рантайма и совместимости.

## Источники истины

### 1. AIModel

Источник истины для конкретной модели:
- provider;
- model identity;
- endpoint;
- request template;
- набор подключённых параметров;
- overrides параметров;
- pricing-конфиг;
- compiled schema snapshot.

### 2. CanonicalParameter

Источник истины для смысла параметра:
- `code`: `resolution`, `duration`, `aspect_ratio`;
- `ui_semantic`;
- тип значения;
- базовый UI control;
- базовые options/min/max/step;
- aliases для auto-match;
- допустимость участия в pricing.

### 3. ModelParameterBinding

Источник истины для связи transport и UI внутри модели:
- ссылка на `AIModel`;
- ссылка на `CanonicalParameter`;
- placeholder/transport key;
- request path;
- label override;
- default override;
- options override;
- visibility/order;
- advanced flags.

### 4. PricingConfig

Источник истины для цены модели:
- режим (`fixed`, `lookup`);
- dimensions;
- lookup values;
- bulk JSON import;
- compiled pricing payload.

### 5. Compiled Artifacts

Производные данные:
- `parameters_schema`;
- compiled pricing JSON;
- summary/preview для админки;
- runtime-ready mapping.

Они не должны быть основным местом ручного редактирования.

## Целевая структура карточки AIModel

Карточка `AIModel` превращается в управляемый мастер из блоков.

### 1. Model Identity

Обычные поля модели:
- provider;
- name;
- model_type;
- api_endpoint;
- is_active;
- preview/description/tags.

### 2. Request Mapping

Админ редактирует transport-template и видит:
- найденные placeholders;
- какие placeholders уже связаны;
- какие потеряны;
- какие новые и требуют маппинга.

Система пытается автоматически сопоставлять placeholders с `CanonicalParameter` по alias.

### 3. UI Parameters

После binding UI собирается автоматически из `CanonicalParameter`.
Админ правит только overrides:
- label;
- default;
- visibility;
- subset options;
- order.

### 4. Pricing

Pricing редактируется в одном из режимов:
- `Visual grid`;
- `Bulk JSON`;
- `Generate template`.

Для больших матриц bulk-вставка является штатным сценариям, а не аварийным обходом.

### 5. Advanced Mode

Остаётся доступным для:
- raw `request_schema`;
- ручной правки compiled JSON;
- экзотических provider-specific параметров;
- нестандартных конфигураций.

Но advanced mode должен быть вторичным путём.

## Pricing UX

### Режимы

1. `Visual grid`
- для маленьких lookup-таблиц;
- редактор по измерениям и комбинациям.

2. `Bulk JSON`
- textarea/json editor для массовой вставки lookup-цен;
- валидация ключей, формата цен и dimension values.

3. `Generate template`
- генерация шаблона lookup-конфига по выбранным dimension values;
- возможность быстро вставить обратно отредактированный JSON.

### Принцип

Pricing не должен ссылаться на произвольные строки. Он может использовать только те канонические параметры, которые уже реально подключены к модели.

## Автоматизация

### 1. Parse placeholders

При изменении `request_schema` система:
- вытаскивает placeholders;
- сравнивает их с текущими bindings;
- помечает новые/удалённые/несвязанные.

### 2. Auto-match aliases

Для известных алиасов предлагает автопривязку:
- `videoDuration` -> `duration`;
- `size` -> `resolution` или `aspect_ratio` по каталогу и типу модели.

### 3. Compile UI draft

На основе bindings и canonical definitions система автоматически собирает draft UI-конфига.

### 4. Validate before save

Перед сохранением выполняются проверки:
- все placeholders разрешены;
- все bindings валидны;
- defaults входят в options/range;
- pricing использует только доступные параметры;
- pricing keys валидны;
- compiled config собирается без ошибок.

### 5. Compile runtime payloads

После успешной валидации система генерирует:
- compiled `parameters_schema`;
- compiled pricing JSON;
- preview summary для админки.

## Migration Strategy

### Этап 1

Добавить новые нормализованные сущности без отказа от текущих JSON-полей.

### Этап 2

Сделать compile pipeline, который генерирует legacy-compatible JSON из нормализованных данных.

### Этап 3

Подключить новую админку и legacy-read fallback.

### Этап 4

Мигрировать существующие модели и сиды (`setup_kie_ai.py`) в новый источник истины.

### Этап 5

Оставить raw JSON как advanced mode и fallback, но не как primary workflow.

## Обратная совместимость

На переходе фронтенд и рантайм продолжают получать знакомый compiled shape:
- `parameters_schema` как массив schema items;
- `image_inputs_schema` без ломки потребителей;
- pricing в runtime-friendly lookup-формате.

Это позволяет не переписывать потребление схемы на фронте сразу.

## Риски

- Слишком ранний отказ от legacy JSON сломает текущие модели.
- Слишком абстрактная каталогизация ухудшит UX админки.
- Alias auto-match может давать неверные догадки без явного review.
- Pricing editor без bulk/import режима будет бесполезен на больших матрицах.

## Acceptance Criteria

- Новую модель можно завести из одной карточки `AIModel` без ручной сборки огромного JSON.
- Placeholder discovery и binding workflow снижают количество ручных операций.
- UI-параметры собираются из канонического каталога с model-specific overrides.
- Pricing можно задавать как в визуальном виде, так и через bulk JSON/template generation.
- Legacy runtime и фронтенд продолжают работать через compiled artifacts.
- Ошибки конфигурации обнаруживаются до сохранения модели.
