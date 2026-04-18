# Feature Gating — Спецификация реализации

> Дата: 2026-04-14
> Статус: спека для реализации

---

## Цель

Привести feature gating в единую систему: один паттерн, один визуальный стиль (TierBadge), консистентное поведение во всех точках UI.

## Архитектура

### Слои

```
TierBadge (визуал)          — градиентный pill PLUS/PRO/TEAM
useFeatureGate(code) (хук)  — логика: isLocked, tier, openUpgrade(), UpgradeModal
FeatureGate (обёртка)       — удобная обёртка для простых случаев
```

### Почему хук + компонент

Точки гейтинга визуально разные: dropdown item, кнопка, toggle, toolbar. Один `<FeatureGate>` не покрывает все layout-ы. Поэтому:

- **`useFeatureGate(code)`** — хук для кастомных layout-ов (dropdown items, toggles)
- **`<FeatureGate>`** — обёртка для простых случаев (кнопки, которые просто нужно обернуть)

Оба используют один и тот же `TierBadge`.

---

## Компоненты

### 1. TierBadge

**Файл:** `frontend/components/subscription/TierBadge.tsx`

**Props:**
```ts
interface TierBadgeProps {
  tier: "plus" | "pro" | "team";
  variant?: "pill" | "icon";  // default: "pill"
  className?: string;
}
```

**Pill-вариант (основной):**
- Градиент: `from-indigo-500 to-violet-500`
- Текст: `PLUS` / `PRO` / `TEAM` — 9px, bold 700, white, tracking-wide
- Высота: 18px, padding: 0 8px, border-radius: full (pill)

**Icon-вариант (резервный, Glow Ring ↑):**
- Внешний круг: 28px, `bg-violet-500/10`, `shadow-[0_0_12px_rgba(139,92,246,0.25)]`
- Внутренний круг: 20px, градиент `from-indigo-500 to-purple-500`, `shadow-[0_2px_6px_rgba(124,58,237,0.5)]`
- Иконка: `ArrowUp` 12px, white

**Маппинг feature → tier (статический):**
```ts
const FEATURE_TIER_MAP: Record<string, "plus" | "pro" | "team"> = {
  sharing: "plus",
  batch_download: "pro",
  ai_prompt: "pro",
  analytics_export: "team",
};

// Хелпер для получения tier по feature code
export function getTierForFeature(featureCode: string): "plus" | "pro" | "team" {
  return FEATURE_TIER_MAP[featureCode] ?? "pro";
}
```

Маппинг статический — фичи и их min_plan меняются редко. Если потребуется динамика, расширим API.

### 2. useFeatureGate (хук)

**Файл:** `frontend/lib/hooks/useFeatureGate.ts`

```ts
function useFeatureGate(featureCode: string): {
  isLocked: boolean;
  tier: "plus" | "pro" | "team";
  upgradeOpen: boolean;
  setUpgradeOpen: (open: boolean) => void;
  openUpgrade: () => void;
  handleClick: (e?: React.MouseEvent) => boolean; // returns true if locked (prevented)
}
```

**Логика:**
1. Читает `hasFeature` из subscription store
2. `isLocked = !hasFeature(featureCode)`
3. `tier = getTierForFeature(featureCode)`
4. `handleClick` — если locked, вызывает `e.preventDefault()` + `e.stopPropagation()` + открывает модалку. Возвращает `true` если перехватил клик.
5. Компонент-потребитель сам рендерит `<UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} featureCode={featureCode} />`

### 3. FeatureGate v2 (обёртка)

**Файл:** `frontend/components/subscription/FeatureGate.tsx` (обновление)

```ts
interface FeatureGateProps {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
  badgePosition?: "top-right" | "inline-end"; // default: "top-right"
}
```

**Изменения от текущей версии:**
- ~~opacity 50%~~ → нормальный вид, `pointer-events-none` только на children
- ~~ProBadge~~ → `TierBadge` с автоматическим tier из `getTierForFeature`
- Клик по обёртке → UpgradeModal (как сейчас)

---

## Точки гейтинга — план изменений

### Существующие (5 штук)

| # | Место | Текущий паттерн | Новый паттерн |
|---|-------|----------------|---------------|
| 1 | GroupCard → «Поделиться» | Ручной `hasFeature` + ProBadge + UpgradeModal | `useFeatureGate("sharing")` + TierBadge `ml-auto` |
| 2 | ProjectCard → «Поделиться» | Ручной `hasFeature` + ProBadge + UpgradeModal | `useFeatureGate("sharing")` + TierBadge `ml-auto` |
| 3 | ElementBulkBar → «Поделиться» | `<FeatureGate>` с opacity 50% | `<FeatureGate>` v2 (без opacity) |
| 4 | PromptEnhanceToggle | Ручной conditional + ProBadge + disabled checkbox | `useFeatureGate("ai_prompt")` + TierBadge |
| 5 | ProjectGrid → «Создать проект» | quota check + серая кнопка | Оставляем quota check, но: фикс null-safety, TierBadge вместо серого стиля |

### Баги для фикса

| Баг | Файл | Проблема | Исправление |
|-----|------|----------|-------------|
| hasFeature в селекторе | PromptEnhanceToggle.tsx:15 | `s.hasFeature("ai_prompt")` вызывается внутри Zustand-селектора — ре-рендеры на каждое обновление стора | Вынести: `const hasFeature = useSubscriptionStore(s => s.hasFeature)`, потом `hasFeature("ai_prompt")` — или просто использовать `useFeatureGate` |
| Нет null-safety quota | ProjectGrid.tsx | `quota` может быть undefined, `isAtProjectLimit` будет false → кнопка активна при лимите | Добавить fallback: если quota undefined и user на free — считать что лимит не известен, не блокировать (backend всё равно отклонит) |
| Sparkles в UpgradeModal | UpgradeModal.tsx:17,29,37,89,139 | Используется запрещённая иконка Sparkles | Заменить на `Crown` или `Gem` |

### Новая точка (1 штука)

| # | Место | Файл | Что гейтить |
|---|-------|------|-------------|
| 6 | DetailPanel → «Повторить запрос» | `components/lightbox/DetailPanel.tsx` | Storage limit — если хранилище заполнено, кнопка показывает TierBadge + клик → UpgradeModal (limit mode) |

**Реализация:** Не feature gate, а limit gate. Читаем `user.quota.storage_used_bytes` / `storage_limit_bytes`. Если usage >= limit → показываем badge + modal в limit-режиме.

---

## Философия (напоминание из дизайн-сессии)

1. Кнопки **НЕ серые, НЕ disabled** — нормальный цвет, нормальный текст
2. **Показать + пометить** — не прятать фичи, бейдж + модалка
3. **Тон позитивный** — «доступно на тарифе X», фиолетовый (#8B7CF7)
4. **Скачивание не гейтим** — `batch_download` ещё не реализован

---

## Удаление ProBadge

После перевода всех точек на TierBadge:
1. Удалить `frontend/components/subscription/ProBadge.tsx`
2. Убрать все импорты ProBadge
3. ProBadge больше нигде не используется

---

## Что НЕ меняем

- Backend модели и сервисы — работают корректно
- UpgradeModal — оставляем как есть (кроме замены Sparkles)
- LimitBar — оставляем
- TrialBanner — оставляем
- Subscription store API — оставляем (hasFeature, setFromUser)
- Backend enforcement (permissions, views) — работает корректно

---

## Документация

После реализации обновить `docs/systems/subscriptions.md`:
- Добавить секцию «Feature Gating — UI» с описанием TierBadge, useFeatureGate, FeatureGate v2
- Обновить таблицу «Где используется гейтинг» — все 6 точек
- Обновить список компонентов
- Убрать ProBadge из списка
- Переименовать заголовок: «Подписки и feature gating»
