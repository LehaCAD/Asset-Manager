# Сессия 01 — Темы и цвета ✅ ЗАКРЫТА

**Цель:** починить рассинхроны светлой/тёмной темы, вычистить захардкоженные цвета, выровнять с брендбуком (`docs/BRANDBOOK.md`, `pencil-new.pen` → Color System v2 node `gx1cz`).

**Итоги:** 9 задач, 8 закрыты в коде, 1 (BF-01-08) — частично закрыта + остаток в бэклог.

---

## BF-01-01 — WelcomeModal всегда в тёмной теме ✅

**Фикс:** `frontend/components/onboarding/WelcomeModal.tsx` — убраны хардкоды `#1C1C1E`, `text-white`, `text-zinc-300`, `#8B7CF7`, `#FFD700`. Теперь — `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`, акценты через `text-primary` и `bg-warning/10 border-warning/30 text-warning`. CTA-кнопка — через `bg-gradient-to-br from-primary to-[oklch(0.48_0.19_281)]`.

**Смежно:** модалка теперь корректно берёт фон у `Dialog` и реагирует на переключение темы.

---

## BF-01-02 — Жёлтая плашка с бонусами невидима на светлой теме ✅

Все «кадровые» плашки переведены на токен `warning` (амбер в обеих темах):
- `OnboardingEmptyState.tsx` — reward badge `bg-warning/10 border-warning/30 text-warning`;
- `WelcomeModal.tsx` — achievement hint (Trophy) на том же токене;
- `AchievementToast.tsx` — reward pill на том же токене.

Убраны прямые `#FFD700` и `rgba(255,215,0,…)` на полупрозрачных фонах, которые в светлой теме сливались в невидимое.

---

## BF-01-03 — «Создайте первый проект» белым по белому ✅

**Фикс:** `frontend/components/onboarding/OnboardingEmptyState.tsx` — заголовок `text-white → text-foreground`. Теперь в обеих темах читается.

---

## BF-01-04 — Бейдж TRIAL: жёлто-розовый → зелёный (как FREE) ✅

**Фикс:** `frontend/components/subscription/PlanBadge.tsx` — градиент TRIAL `from-amber-400 to-pink-500` заменён на `from-teal-500 to-emerald-500` (тот же, что у FREE). Платные тарифы остаются на `indigo-500 → violet-500` — «фиолетовый градиент». Заодно закрывает **BF-09-04** (дубль).

---

## BF-01-05 — Luxury-тост достижения на светлой теме ✅

**Фикс:** `frontend/components/onboarding/AchievementToast.tsx` — базовый фон переведён на `bg-card border-border`; акцент-бар — `bg-gradient-to-r from-warning … (или primary)`; бейдж с Trophy — `bg-warning/15 text-warning`; текст — `text-foreground / text-muted-foreground`. Убрана тёмная заливка `#1F1A2E → #241B34 → #1A1526`.

---

## BF-01-06 — Валюта «Кадры» на светлой теме ✅

Инвентаризация + замена:
- `OnboardingEmptyState`, `WelcomeModal`, `AchievementToast`, `OnboardingTaskRow`, `OnboardingPopover` — все gold-акценты перешли на токен `warning`.
- `KadrIcon` (SVG) — остался самобытным golden — иконка узнаваема на любом фоне.
- Навбар-баланс (`Navbar.tsx`) — уже использует `bg-success/10 border-success/20` и `text-foreground`, трогать не надо.
- В PromptBar и `ConfigPanel` «кадр» выводится через `KadrIcon + text-muted-foreground` — ок.

---

## BF-01-07 — Тусклый прогресс-бар хранилища на светлой теме ✅

**Фикс:** `frontend/app/(cabinet)/cabinet/storage/page.tsx` — трек основного и per-project прогресс-баров с `bg-border/40 dark:bg-muted/40` заменён на `bg-muted` (одинаково контрастно в обеих темах). Заливка остаётся `bg-primary`.

---

## BF-01-08 — Общая ревизия захардкоженных цветов — частично ✅

В этой сессии заменены захардкоженные цвета в следующих местах:
- `OnboardingTaskRow.tsx` — все инлайн-стили (`#8B7CF7`, `#FFD700`, `#888`, `rgba(139,124,247,…)`, `rgba(34,197,94,…)`) выброшены, заменены на `primary`/`success`/`warning`/`muted`/`muted-foreground`.
- `OnboardingPopover.tsx` — popover перешёл на `bg-card border-border`, progress на `bg-muted`, остальные `#8B7CF7`, `#FFD700`, `#888`, `rgba(255,255,255,…)` — на токены.
- `MessageBubble.tsx` и `ChatMessageList.tsx` — см. BF-01-09.
- `EmailVerificationBanner.tsx`, `check-email/page.tsx` — см. сессия 09.

Остаток (не критичный, вынесен в `docs/BACKLOG_IDEAS.md` → «Захардкоженные цвета — остаток»):
- `showcase-components.tsx`, `RegisterContainer`, `LoginContainer`, `AuthShowcase` — только на auth-странице (она сама по себе всегда тёмная), `text-white` + `#6C5CE7/#8B7CF7` там намеренно.
- `ElementCard`/`ElementSelectionCard`/`Filmstrip` badges — `text-white` поверх гарантированно тёмных оверлеев на превью (`bg-black/…`), это ок.
- `PromptBar` градиентная CTA-кнопка — `text-white` на `from-primary to-[oklch…]`, фон гарантирован.

---

## BF-01-09 — Цвета баблов и pills чата поддержки ✅

**Фикс:**
- `frontend/components/feedback/MessageBubble.tsx` — `bg-[#2B5278]` (admin) → `bg-primary/15 border border-primary/20`; `bg-[#182533]` (user) → `bg-muted border border-border/50`. Время — `text-muted-foreground` в обоих случаях.
- `frontend/components/feedback/ChatMessageList.tsx` — date-pill `bg-[#213040]/80 text-white/80` → `bg-muted text-muted-foreground`.

**Связь с сессией 07:** логика чата (BF-07-01/02 — libmagic и rollback) не трогалась, остаётся под седьмой сессией.

---

## Итог сессии

- **Закрыто в коде:** BF-01-01, BF-01-02, BF-01-03, BF-01-04, BF-01-05, BF-01-06, BF-01-07, BF-01-08 (частично), BF-01-09.
- **В бэклог:** остаточные `text-white` и `#xxxxxx` на гарантированно тёмных фонах — вынесены отдельным пунктом в `docs/BACKLOG_IDEAS.md`.
- **Побочно закрыто:** BF-09-04 (дубль BF-01-04 — бейдж TRIAL).
- **Ждёт коммита:** после смоук-проверки пользователем (оба теме, мобилка + десктоп).

### Файлы правок

- `frontend/components/subscription/PlanBadge.tsx`
- `frontend/components/onboarding/WelcomeModal.tsx`
- `frontend/components/onboarding/OnboardingEmptyState.tsx`
- `frontend/components/onboarding/AchievementToast.tsx`
- `frontend/components/onboarding/OnboardingTaskRow.tsx`
- `frontend/components/onboarding/OnboardingPopover.tsx`
- `frontend/components/feedback/MessageBubble.tsx`
- `frontend/components/feedback/ChatMessageList.tsx`
- `frontend/app/(cabinet)/cabinet/storage/page.tsx`
