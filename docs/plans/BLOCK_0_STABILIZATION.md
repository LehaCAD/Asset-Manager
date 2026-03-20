# Блок 0: Стабилизация

> Задачи из agent-tasks.md: #0 (Аудит), #11 (Деплой и данные)
> Зависимости: нет — это первый блок
> Область: весь проект, без изменений бизнес-логики

## Цель

Зафиксировать текущее состояние как baseline. Убедиться что всё деплоится, миграции безопасны, production данные не пострадают.

---

## Предварительные условия

- Бэкап production БД уже сделан: `backups/apom_db_before_local_dev_20260320_082106.sql`
- Ветка: `production-setup`
- Есть незакоммиченные изменения (AI admin redesign, credits, ui_control_override)

---

## Шаг 1: Аудит незакоммиченных изменений

**Что сделать:**
1. Просмотреть `git diff` и `git status` — понять все изменения.
2. Проверить что миграции `0006_add_ui_control_override.py` и `0007_add_ui_control_override_column.py` не конфликтуют.
3. Убедиться что эти миграции — `AddField` / `AlterField` (не деструктивные).
4. Проверить что `pricing_schema` на существующих AIModel не пуст (поле blank=False).

**Файлы для проверки:**
- `backend/apps/ai_providers/migrations/0006_*.py`
- `backend/apps/ai_providers/migrations/0007_*.py`
- `backend/apps/ai_providers/models.py`
- `backend/apps/credits/` — все файлы
- `docker-compose.yml`

**Критерий готовности:** Список всех изменений с пометками "безопасно для прода" / "требует внимания".

---

## Шаг 2: Проверка миграций на совместимость

**Что сделать:**
1. Восстановить бэкап БД локально:
   ```bash
   docker compose up -d db
   # Восстановить из backups/apom_db_before_local_dev_20260320_082106.sql
   ```
2. Применить все миграции на копии production БД:
   ```bash
   docker compose exec backend python manage.py migrate --plan
   docker compose exec backend python manage.py migrate
   ```
3. Проверить что данные выжили:
   ```bash
   docker compose exec backend python manage.py shell -c "
   from apps.ai_providers.models import AIModel
   for m in AIModel.objects.all():
       print(f'{m.name}: params={type(m.parameters_schema).__name__}, pricing={m.pricing_schema}')
   "
   ```

**Критерий готовности:** Миграции проходят без ошибок, данные на месте.

---

## Шаг 3: Проверка дубликата миграций

**Что сделать:**
Файлы `0006_add_ui_control_override.py` и `0007_add_ui_control_override_column.py` — вероятно, дубликаты (оба добавляют `ui_control_override`).

1. Прочитать оба файла.
2. Если дубликаты — удалить `0007`, оставить `0006`.
3. Если разные — оставить оба, убедиться что `0007` зависит от `0006`.

**Не делать:** Не сквошить миграции, не делать `migrate --fake`. Просто убрать дубликат, если он есть.

---

## Шаг 4: Docker-compose проверка

**Что сделать:**
1. Проверить что `docker compose up` работает локально (dev):
   ```bash
   docker compose up --build
   ```
2. Проверить основные сценарии:
   - [ ] Логин работает
   - [ ] Список проектов загружается
   - [ ] Workspace открывается (сцена с элементами)
   - [ ] Генерация запускается (если есть активная модель)
   - [ ] WebSocket подключается (статус элемента обновляется в реальном времени)

3. Проверить `docker-compose.production.yml`:
   - [ ] Все env-переменные читаются из `.env` (не хардкод)
   - [ ] Shared volume `upload_staging` настроен
   - [ ] Celery: `--concurrency=2 --max-memory-per-child=300000`

**Файлы:**
- `docker-compose.yml`
- `docker-compose.production.yml`

---

## Шаг 5: Коммит baseline

**Что сделать:**
1. Закоммитить все текущие изменения с описательным сообщением:
   ```
   feat: AI admin redesign — parameter bindings, pricing config, credits system

   - CanonicalParameter, ModelParameterBinding, ModelPricingConfig models
   - Admin workflow for mapping placeholders to canonical parameters
   - ui_control_override per binding
   - Credits: CreditsTransaction, CreditsService, balance/estimate endpoints
   - Compiler: runtime parameters_schema and pricing_schema generation
   ```
2. Не пушить пока — это локальный baseline.

**Критерий готовности:** Чистый `git status`, все изменения зафиксированы.

---

## Шаг 6: Документация деплой-процесса

**Что сделать:**
Убедиться что `dev and deploy.md` актуален. Проверить:
- [ ] Команда для полного редеплоя корректна
- [ ] Упомянут restart nginx после пересборки
- [ ] Env-переменные в примере `.env` совпадают с тем, что читает `settings.py`

**Не делать:** Не менять `settings.py`, не менять docker-compose. Только проверить и обновить документацию если что-то расходится.

---

## Чего НЕ делать в этом блоке

- Не менять бизнес-логику
- Не менять модели (кроме удаления дубликата миграции)
- Не менять UI
- Не пушить на production
- Не удалять файлы из `backups/`
