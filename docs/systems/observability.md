# observability — логи, Sentry, корреляция

Актуально с: **2026-04-17**. Спека: [`docs/superpowers/specs/2026-04-17-observability-design.md`](../superpowers/specs/2026-04-17-observability-design.md).

Коротко: каждая ошибка получает **`request_id`** (HTTP) или **`task_id`** (Celery) + сгенерированный **`error_id`** (для 5xx) и летит одновременно в stdout (JSON) и в Sentry. Клиент видит `error_id` — по нему можно найти полный трейс за секунды.

## Быстрый дебаг

Пользователь пишет в поддержку: «Получил ошибку, код `abc123def456...`».

1. **Sentry:** поиск по `error_id:abc123def456...` — откроется инцидент с трейсом.
2. **Логи backend:** `docker compose -f docker-compose.production.yml logs --tail=5000 backend | grep abc123def456` — найдёт запись.
3. В логе будет `request_id` — по нему можно собрать всю цепочку запроса:
   ```bash
   docker compose -f docker-compose.production.yml logs --tail=20000 backend celery | grep <request_id>
   ```

Если ошибка в Celery-задаче: в записи будет `task_id` и `task_name`. Поиск по `task_id` покажет весь жизненный цикл задачи.

## Backend

### Формат логов

Контролируется env-переменными:

- `LOG_FORMAT` — `json` (прод) или `text` (dev). По умолчанию: `json` в проде, `text` в dev.
- `LOG_LEVEL` — `INFO` по умолчанию. В проде можно временно ставить `DEBUG`.

В JSON-логе каждая запись содержит: `timestamp`, `level`, `logger`, `message`, `request_id`, `user_id`, `path`, `method`, `task_id`, `task_name` (если применимо), плюс `extra`, переданное в `logger.xxx(..., extra={...})`.

### Корреляция

`apps/common/middleware.py:RequestIDMiddleware` на каждом запросе:
- читает `X-Request-ID` из хедера или генерит UUID;
- биндит в contextvars — все `logger.xxx` внутри запроса автоматически получают поле `request_id`;
- возвращает `X-Request-ID` в ответе.

`apps/common/celery_signals.py` делает то же для Celery-задач: `task_prerun` биндит `task_id`/`task_name`, `task_failure` логирует исключение.

Чтобы пробросить `request_id` из HTTP-запроса в Celery-задачу — передавай его в kwargs как `_request_id`:

```python
from apps.common.logging_context import get_request_id
my_task.delay(foo=1, _request_id=get_request_id())
```

### DRF exception handler

`apps/common/exceptions.py:api_exception_handler`:
- 4xx (валидация, permission denied, not found) — WARNING с контекстом, тело ответа: `{error, error_id, ...original}`;
- 5xx и непойманные исключения — `logger.exception` + `error_id` в ответ и в Sentry-tag `error_id`;
- Клиент всегда получает `error_id` в теле — его можно и нужно показывать в UI.

### Silent excepts

Правило: **любой `except: pass` — это баг**, если только не стоит ровно над `except X as e: raise` или подобным deliberate-игнорированием c комментарием-обоснованием.

Если ошибку реально можно игнорировать (best-effort telemetry, cleanup, email-send в фоне) — всё равно:
- узкий класс исключения (`except OSError`, не `except Exception`);
- `logger.warning(..., exc_info=True)` или `logger.exception(...)`;
- комментарий **почему**.

Текущее состояние (после 2026-04-17): все silent pass-catches проаудированы и переведены на логирование. Перед релизом фич — проверяй `grep -rn "except.*:\s*pass" backend/apps`.

## Frontend

### Logger facade

`frontend/lib/utils/logger.ts` — тонкая обёртка:

```ts
import { logger } from "@/lib/utils/logger";

logger.error("upload_failed", { elementId, fileSize }, err);   // console.error + Sentry.captureException
logger.warn("slow_api", { url, duration });                    // console.warn + Sentry.captureMessage warning
logger.info("user_action", { what: "export" });                // console.info only
```

**Запрещено:** `catch(e) {}`, `.catch(() => {})`, `.catch(() => null)` без логирования. Если ошибка действительно best-effort — всё равно `logger.warn` с контекстом (почему ничего не делаем).

### Error boundaries

- `app/error.tsx` — ловит ошибки рендера в сегментах, репортит в Sentry с тегом `boundary=segment`.
- `app/global-error.tsx` — корневой fallback, тег `boundary=root`.

Оба показывают пользователю `error.digest` — его тоже можно назвать в поддержке, по нему найдётся в Sentry.

### API client

`frontend/lib/api/client.ts`:
- `ApiError` — класс ошибки с `status`, `errorId`, `requestId`, `url`, `payload`;
- `normalizeError` — парсит ответ бэкенда, забирает `X-Request-ID` хедер и `error_id` из тела, логирует не-2xx через `logger.error("api_error", ...)`, возвращает `ApiError` для UI;
- UI-слои (stores, компоненты) показывают `toast.error(err.message)` + могут показать `err.errorId` в подписи.

### Sentry

`@sentry/nextjs`, три конфига:
- `sentry.client.config.ts` — браузер;
- `sentry.server.config.ts` — Node-runtime на сервере;
- `sentry.edge.config.ts` — edge-runtime.

Инициализация через env-переменные:
- `NEXT_PUBLIC_SENTRY_DSN` — DSN;
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_RELEASE` — опционально, но желательно в CI.

`next.config.ts` обёрнут в `withSentryConfig(...)` — это включает автоматический upload sourcemap при наличии `SENTRY_AUTH_TOKEN`. Без токена всё равно работает, просто stacktraces в Sentry будут минифицированные.

## Инфра

### Docker log rotation

В `docker-compose.production.yml` прописан x-anchor `default-logging`:
```yaml
driver: json-file
options:
  max-size: "10m"
  max-file: "3"
```

Применяется к backend, celery, frontend, nginx. Итого: ~30 MB логов на сервис, старые ротируются. `docker compose logs -f backend` работает как обычно.

### Прод env-переменные для observability

```
LOG_FORMAT=json
LOG_LEVEL=INFO
SENTRY_DSN=https://...
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=<git-sha>     # ставится CI
SENTRY_TRACES_SAMPLE_RATE=0.1

NEXT_PUBLIC_SENTRY_DSN=https://...
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_RELEASE=<git-sha>
SENTRY_ORG=<sentry-org>
SENTRY_PROJECT=<sentry-project>
SENTRY_AUTH_TOKEN=<...>      # только в CI, для upload sourcemaps
```

## Что дальше (не сделано сегодня)

- Агрегация логов (Loki/ELK/CloudWatch). Пока достаточно stdout + Sentry.
- Prometheus-метрики / Grafana-дашборды. Отдельная задача.
- Distributed tracing сверх Sentry Trace. Не нужно на текущем масштабе.
- Structured audit-log для бизнес-событий (перевод средств, смена тарифа и т.п.) — отдельная тема, пересекается с credits/subscriptions.
