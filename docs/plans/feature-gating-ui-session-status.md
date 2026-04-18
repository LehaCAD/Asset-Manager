# Feature Gating UI — Статус сессии

> Дата: 2026-04-14 (обновлено 2026-04-14)
> Сессия: Дизайн UI feature gating для подписок
> Статус: **Дизайн бейджей согласован, открыты 2 вопроса по скоупу**

---

## Цель

Продумать и отрисовать, как визуально обозначать ограничения подписки в интерфейсе Раскадровки — кнопки, меню, тулбары, все реальные места.

## Тарифная сетка (видимая)

| Код | Название | Цена | Проекты | Хранилище | Эксклюзивные фичи |
|-----|----------|------|---------|-----------|--------------------|
| `free` | Старт | 0 ₽ | 1 | 1 ГБ | — |
| `creator` | Создатель | 990 ₽ | 5 | 20 ГБ | Доступ по ссылке |
| `creator_pro` | Создатель Pro | 1 990 ₽ | ∞ | 100 ГБ | + Массовое скачивание, Усиление промпта |
| `team` | Команда | 4 990 ₽ | ∞ | 500 ГБ | + Экспорт аналитики |

`enterprise` — скрыт, не показываем в UI.

## Что сделано

### 1. Полный аудит точек гейтинга (22 штуки)

**Уже гейтятся (5):**

| Место | Файл | Фича | Как сейчас |
|-------|------|------|-----------|
| GroupCard dropdown → «Поделиться» | `components/element/GroupCard.tsx:187-201` | `sharing` | ProBadge `ml-auto` в DropdownMenuItem |
| ProjectCard dropdown → «Поделиться» | `components/project/ProjectCard.tsx:159-179` | `sharing` | ProBadge `ml-auto` в DropdownMenuItem |
| ElementBulkBar → «Поделиться» | `components/element/ElementBulkBar.tsx:59-71` | `sharing` | Обёрнут в `<FeatureGate>` (opacity 50%) |
| PromptEnhanceToggle | `components/generation/PromptEnhanceToggle.tsx:18-38` | `ai_prompt` | Disabled чекбокс + ProBadge + bg-muted |
| ProjectGrid → «Создать проект» | `components/project/ProjectGrid.tsx:44-55` | quota `max_projects` | Кнопка серая `bg-muted cursor-not-allowed` |

**Надо добавить гейтинг (7 новых мест):**

| Место | Файл | Что гейтить |
|-------|------|-------------|
| LightboxModal → «Скачать» | `components/lightbox/LightboxModal.tsx:540-582` | `batch_download`? |
| LightboxModal → «Оригинал» | `components/lightbox/LightboxModal.tsx:585-595` | `batch_download`? |
| ElementCard hover → download button | `components/element/ElementCard.tsx:396-407` | `batch_download`? |
| ElementCard dropdown → «Скачать» | `components/element/ElementCard.tsx:558-559` | `batch_download`? |
| DetailPanel → «Повторить запрос» | `components/lightbox/DetailPanel.tsx:321-333` | generation limits |
| Cabinet History → download в preview | `app/(cabinet)/cabinet/history/page.tsx:376-389` | `batch_download`? |
| ~~CreateSceneDialog → создание группы~~ | ~~`components/scene/CreateSceneDialog.tsx`~~ | ~~quota `max_scenes_per_project`~~ — **убрано: лимит рудиментный** |

**Не нуждаются в гейтинге (10):** переименование, удаление, перемещение, копирование промпта, фильтры аналитики, публичные share-ссылки, статусы согласования.

### 2. Сравнение с конкурентами

Исследованы: Canva, Leonardo.ai, Runway ML, Midjourney, Pika.

| | **Canva** | **Leonardo** | **Runway** | **Midjourney** | **Раскадровка** |
|---|---|---|---|---|---|
| Иконка | Crown жёлтая | Нет | Нет | Нет | Pill с текстом тарифа |
| При клике | Upgrade dialog | Disabled/redirect | Disabled+тултип | Фича скрыта | UpgradeModal |
| В меню | Crown справа | Grayed out | Скрыто | Скрыто | Pill справа |
| Лимиты | Бинарно | Счётчик токенов | Счётчик кредитов | Авто-Relax | Bar + pill 80% |
| Философия | Показать+пометить | Скрыть/стоимость | Disabled+объяснить | Скрыть | **Показать+пометить** |

### 3. Исследование вариантов бейджа

Отрисованы и рассмотрены:
- 4 варианта формата: PRO pill, замочек на круге, замочек без фона, корона на круге
- 12 иконок-кандидатов (arrow-up, chevron-up, trending-up, rocket, zap, gem, shield, star, badge-check, circle-chevron-up, circle-arrow-up, lock)
- 6 вариантов pill per тариф (градиент, разные цвета, outline, иконка+текст, универсальный, subtle muted)
- 4 подхода к системе (ПЛЮС/PRO/TEAM, ↑/PRO/TEAM, цветовая иерархия, один универсальный)
- 8 вариантов «сочной стрелки» (glow ring, double ring, glow+ring, gold glow, pill+↑, thick gradient, soft gem, neon)

Всё отрисовано в `pen/gating.pen` в 5 фреймах.

## Принятые решения

### Философия (из сессии 1)
1. **Кнопки НЕ серые, НЕ disabled** — обычный цвет, обычный текст. При клике → UpgradeModal.
2. **«Показать + пометить»** — не прятать фичи, не делать серыми. Бейдж + модалка.
3. **Тон позитивный** — «доступно на тарифе X», не «заблокировано». Фиолетовый (#8B7CF7), без красного/жёлтого.
4. **UpgradeModal уже работает** — два режима (feature + limit), API есть.

### Дизайн бейджа (согласовано в сессии 2)

**Основной бейдж — градиентный pill с текстом тарифа:**

| Тариф | Текст pill | Когда показывать |
|-------|-----------|-----------------|
| Создатель (990₽) | `PLUS` | Юзер на Старте видит бейдж фич Создателя |
| Создатель Pro (1990₽) | `PRO` | Юзер на Старте или Создателе видит бейдж фич Pro |
| Команда (4990₽) | `TEAM` | Юзер ниже Команды видит бейдж фич Команды |

Стиль pill:
- Градиент: `from-indigo-500 (#6366F1) to-violet-500 (#8B5CF6)`
- Текст: 9px, bold 700, white, letter-spacing 0.5
- Высота: 18-20px, cornerRadius: pill (50%)
- Padding: 0 8px

**Резервный бейдж — Glow Ring ↑ (универсальный, без текста):**
- Внешний круг: 28-32px, fill `#8B5CF615`, `box-shadow: 0 0 12px #8B5CF640`
- Внутренний круг: 20-22px, gradient `#6366F1 → #A855F7`, `box-shadow: 0 2px 6px #7C3AED80`
- Иконка: `arrow-up` 11-12px, white
- Использовать когда pill не помещается или когда не нужно указывать конкретный тариф

**Реализация — легко менять:**
- Один компонент `<TierBadge tier="pro" />` который рендерит нужный pill
- Текст и стиль определяются по `tier` prop
- Переключение pill ↔ glow ring — через prop `variant="pill" | "icon"`
- Изменение в одном компоненте → меняется везде

### Enterprise
- **Не показываем** в UI вообще — скрытый тариф.

## Решения, которые надо принять

1. ~~Какой вариант бейджа?~~ → **Решено: pill PLUS/PRO/TEAM, резерв Glow Ring ↑**
2. ~~Нужны ли разные иконки per tier?~~ → **Решено: нет, один стиль pill, разный текст**
3. ~~Гейтить ли скачивание?~~ → **Отложено.** Массовое скачивание (`batch_download`) ещё не реализовано — нет ни эндпоинта, ни UI. Скачивание по одному бесплатно для всех тарифов. Когда batch_download будет готов — тогда и гейтим.
4. ~~Гейтить ли создание групп?~~ → **Закрыто: не гейтим.** Лимит `max_scenes_per_project` — рудимент, его нужно убрать из модели. Количество групп в проекте не ограничивается.

## Отрисовка

### Pen-файл: `pen/gating.pen`

| Фрейм | Содержание |
|-------|-----------|
| **Feature Gating — Badge Variants** (`Xy3CA`) | 4 варианта бейджа (A/B/C/D) × 5 контекстов UI: GroupCard dropdown, PromptEnhanceToggle, ElementBulkBar, Lightbox toolbar, ProjectGrid header (3 состояния лимита) |
| **Иконки — варианты для бейджа** (`hSLn7`) | 12 иконок-кандидатов крупно + в контексте меню (на круге и без) |
| **Pill-бейджи по тарифам** (`dAYJK`) | 6 вариантов оформления pill (градиент, разные цвета, outline, иконка+текст, универсальный, subtle) + в контексте dropdown |
| **Система бейджей — 4 тарифа** (`2LFRZ`) | 4 подхода (ПЛЮС/PRO/TEAM, ↑/PRO/TEAM, цветовая иерархия, универсал) + в контексте dropdown |
| **Сочная стрелка — варианты** (`Y2Gpv`) | 8 вариантов оформления (glow ring, double ring, glow+ring, gold, pill+↑, thick, soft gem, neon) + в контексте dropdown |

### Основной дизайн-файл: `pen/pencil-new.pen`
- Color System v2 (`gx1cz`), UI Primitives (`p7bxZ`) и др. — не тронуты

## Ключевые цвета дизайн-системы

- Deepest/Content: `#0B0F1A`
- Base/Chrome: `#0F172A`
- Surface/Cards: `#1E293B`
- Elevated/Hover: `#334155`
- Primary Accent: `#8B7CF7`
- Accent Hover: `#A09AF0`
- Text Primary: `#F8FAFC`
- Text Secondary: `#94A3B8`
- Text Muted: `#64748B`
- Border: `#1E293B` / `#334155`
- ProBadge gradient: `from-indigo-500 (#6366F1) to-violet-500 (#8B5CF6)`

## Файлы для контекста

- `docs/systems/subscriptions.md` — документация подсистемы подписок (актуальная)
- `backend/apps/subscriptions/models.py` — Plan, Feature, Subscription модели
- `frontend/components/subscription/` — ProBadge, FeatureGate, UpgradeModal, LimitBar, TrialBanner
- `frontend/lib/store/subscription.ts` — Zustand store с `hasFeature()`

## Следующие шаги

1. Принять решения по вопросам 3 и 4 (скачивание, группы)
2. Реализовать компонент `<TierBadge>` (заменит текущий `<ProBadge>`)
3. Обновить существующие 5 точек гейтинга на новый `<TierBadge>`
4. Добавить гейтинг в 7 новых мест
5. Обновить `<FeatureGate>` — убрать opacity 50%, оставить нормальный вид + бейдж
