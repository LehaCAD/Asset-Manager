# Визуальная полировка Pricing, Balance и Layout кабинета — Design Spec

> **Дата:** 2026-04-15
> **Статус:** Согласовано с пользователем
> **Файлы:** pricing page, balance page, cabinet layout, balance-компоненты, subscriptions API

---

## Контекст

Три связанные задачи по визуальной полировке:

1. **Pricing** (`/pricing`) — сделать страницу сочной, убрать лишние иконки, акцент на Создатель PRO, trial данные из API
2. **Balance** (`/cabinet/balance`) — переработать layout с табами (референс: Timeweb), привести историю в порядок
3. **Layout кабинета** — ограничить max-width всего кабинета до 1440px

---

## 1. Pricing — визуальная переработка

### Файлы
- `frontend/app/(workspace)/pricing/page.tsx`
- `frontend/lib/types/index.ts` (тип PlanInfo)
- `backend/apps/subscriptions/serializers.py` (PlanListSerializer)

### 1.1 Иконки — единый стиль

**Убрать все иконки** из карточек тарифов, кроме:
- `Check` (lucide) — для всех лимитов и фич (единый визуальный язык)
- `KadrIcon` — для строки с кадрами (валюта проекта)

Конкретно удалить из импортов и использования: `FolderOpen`, `HardDrive`, `Layers`, `Gift`.

**Оставить:** `Star` (бейдж "Рекомендуем"), `Clock` (бейдж "Пробный период") — семантически оправданы для бейджей, не для фич.

Строки лимитов (проекты, хранилище) — рендерить с `Check`, как фичи. Кадры — с `KadrIcon`.

### 1.2 Карточки тарифов — визуальная иерархия

**Рекомендуемый тариф** (Создатель PRO, `is_recommended: true`):
- Border: `border-primary/40` (заметный, но не кричащий)
- Glow-тень: `shadow-[0_0_20px_-4px_hsl(var(--primary)/0.25)]`
- Бейдж: "Рекомендуем" — `bg-primary/10 text-primary`, с `Star` иконкой (визуально отличается от "Ваш тариф" с Check — избегаем путаницы)
- CTA: gradient `from-primary to-primary/80`, glow `shadow-[0_2px_12px_-2px_hsl(var(--primary)/0.4)]`
- Subtle overlay: `bg-primary/5` на всей карточке

**Текущий тариф пользователя:**
- Бейдж: "Ваш тариф" — `bg-emerald-400/10 text-emerald-400`, с `Check` иконкой
- CTA: disabled, "Текущий тариф"

**Trial:**
- Бейдж: "Пробный период" — `bg-amber-400/10 text-amber-400`, с `Clock` иконкой (исключение для бейджей — тут Clock семантически оправдан)

**Остальные тарифы:**
- Border: `border-border`
- Hover: `hover:border-[var(--border-strong)]`
- CTA: outline variant

**Все карточки:** `rounded-lg` (8px, брендбук).

### 1.3 Строки под заголовком

Оставить обе строки — они несут ценность:
- "Все модели генерации доступны на любом тарифе" — снимает страх
- "N дней полного доступа + M Кадров новым пользователям" — триггер конверсии

**Изменения:**
- Убрать иконки (Layers, Gift) — оставить чистый текст
- Стилизация: `text-sm text-muted-foreground`, разделитель `·` между строками (если в одну строку) или две строки без иконок
- **Trial данные из API, не хардкод:** N дней и M кадров берутся из плана с `is_trial_reference: true`

### 1.4 Бэкенд: trial данные в API

**Проблема:** `PlanListSerializer` не отдаёт `trial_duration_days` и `trial_bonus_credits`.

**Решение:** Добавить в ответ `/api/subscriptions/plans/` поля trial-конфигурации:

```python
# backend/apps/subscriptions/serializers.py — PlanListSerializer
class Meta:
    fields = [
        ...,
        'trial_duration_days',
        'trial_bonus_credits',
        'is_trial_reference',
    ]
```

Фронтенд: найти план с `is_trial_reference: true`, взять `trial_duration_days` и `trial_bonus_credits` для отображения строки. Если нет плана с trial — не показывать строку.

**Обновить тип `PlanInfo`** в `frontend/lib/types/index.ts`:
```typescript
interface PlanInfo {
  // ... существующие поля
  trial_duration_days: number;
  trial_bonus_credits: number;  // DecimalField на бэке — сериализовать как число
  is_trial_reference: boolean;
}
```

**Важно:** `trial_bonus_credits` — `DecimalField` в модели, DRF отдаёт строку по умолчанию. В сериализаторе использовать `serializers.FloatField(source='trial_bonus_credits')` или `SerializerMethodField` с `float()` для числового вывода. Фронтенд использует `Math.round()` при отображении (без копеек).

### 1.5 Comparison table

- `Check` для "есть", `—` (прочерк, `text-muted-foreground/40`) для "нет"
- Убрать `X` иконку из импортов
- `rounded-lg` вместо `rounded-xl`
- Рекомендуемый столбец: `bg-primary/5` (уже есть)

### 1.6 Цены — без копеек

`formatPrice()` уже использует `Math.round()` (сделано ранее в этой сессии). Проверить, что comparison table тоже через `formatPrice()` — да, уже так.

### 1.7 Что НЕ менять

- `PLAN_DESCRIPTIONS` хардкод — оставить (в API нет поля, 4 строки не стоят нового эндпоинта)
- Enterprise баннер — уже нормальный
- Comparison table структура — оставить

---

## 2. Balance — табовая структура

### Файлы
- `frontend/app/(cabinet)/cabinet/balance/page.tsx` — основная переработка
- `frontend/components/cabinet/BalanceCard.tsx` — rounded-xl → rounded-lg
- `frontend/components/cabinet/AmountPresets.tsx` — rounded-xl → rounded-lg
- `frontend/components/cabinet/PaymentMethods.tsx` — rounded-xl → rounded-lg
- `frontend/components/cabinet/TopUpSummary.tsx` — rounded-xl → rounded-lg

### 2.1 Структура — табы (референс: Timeweb)

Вместо единой страницы с формой сверху и таблицей снизу — **два таба**:

```
┌──────────────────────────────────────────────┐
│ Платежи                                       │
│ Управляйте балансом и историей пополнений    │
├──────────────────────────────────────────────┤
│ [ Оплата ]  [ История операций ]              │
├──────────────────────────────────────────────┤
│                                               │
│  (содержимое выбранного таба)                 │
│                                               │
└──────────────────────────────────────────────┘
```

Табы реализовать через локальный state (`useState`), без URL-роутинга. Компонент табов — простые кнопки с `border-b` для active.

### 2.2 Таб "Оплата" (по умолчанию)

Содержимое — текущая форма без изменений логики:
- `BalanceCard` — баланс с gradient и KadrIcon
- `AmountPresets` — пресеты сумм
- `PaymentMethods` — способы оплаты
- `TopUpSummary` — итого + CTA

Центрировано: `max-w-[520px] mx-auto` — узкая колонка уместна для формы оплаты.

### 2.3 Таб "История операций"

Содержимое — текущая таблица, но переработанная:
- **Заголовок-строка:** "История операций" + DateRangePicker справа + кнопка "Скачать" (disabled, tooltip "Скоро")
- **Список транзакций** — компактный:
  - Каждая строка: дата (mono, muted) | описание | сумма (success, bold, с KadrIcon) | статус
  - Пока описание одинаковое ("Пополнение баланса"), но структура готова к расширению
  - Убрать колонку "Способ" — пока бесполезна (все "—")
- **Пагинация** — как сейчас
- **Пустое состояние** — "Нет операций за выбранный период"

### 2.4 Кнопка "Скачать"

- UI: кнопка `variant="outline"` с иконкой `Download`, текст "Скачать"
- Состояние: `disabled`, `title="Скоро"` или tooltip
- Бэкенд: не реализуем сейчас — только UI-заглушка

### 2.5 rounded-xl → rounded-lg

Все 4 компонента balance (`BalanceCard`, `AmountPresets`, `PaymentMethods`, `TopUpSummary`) используют `rounded-xl`. Заменить на `rounded-lg` (8px, брендбук).

---

## 3. Layout кабинета — max-width

### Файл
- `frontend/app/(cabinet)/cabinet/layout.tsx` — строка 89

### Изменение

```diff
- <div className="flex flex-1 min-h-0 p-3 gap-3">
+ <div className="flex flex-1 min-h-0 p-3 gap-3 max-w-[1440px] mx-auto w-full">
```

**Эффект:**
- Full HD (1920px): кабинет занимает ~75% ширины, естественные поля по бокам
- Ультравайд: кабинет по центру, как у Timeweb
- Мониторы ≤1440px: без изменений

**Арифметика:** 1440px total = sidebar 260px + gap 12px + content card ~1168px. Внутри content card стоит `max-w-5xl` (1024px) + padding 32px×2. Итого контент ~1024px на самых широких экранах. Это нормально для кабинетных страниц.

---

## 4. Чеклист реализации

### Бэкенд
- [ ] Добавить `trial_duration_days`, `trial_bonus_credits`, `is_trial_reference` в `PlanListSerializer`

### Фронтенд — Pricing
- [ ] Убрать все иконки кроме Check и KadrIcon из карточек
- [ ] Рекомендуемый тариф: gradient border + glow + бейдж с Star
- [ ] Текущий тариф: бейдж "Ваш тариф" с Check
- [ ] Строки под заголовком: убрать иконки, trial данные из API
- [ ] Comparison table: Check + прочерк вместо Check + X
- [ ] rounded-xl → rounded-lg по всей странице
- [ ] Обновить тип `PlanInfo` в types/index.ts

### Фронтенд — Balance
- [ ] Реструктурировать в табы (Оплата / История операций)
- [ ] Таб "Оплата": текущая форма, centered
- [ ] Таб "История": компактный список, убрать колонку "Способ"
- [ ] Кнопка "Скачать" (disabled заглушка)
- [ ] rounded-xl → rounded-lg в 4 компонентах

### Фронтенд — Layout
- [ ] max-w-[1440px] mx-auto w-full на внешний контейнер кабинета

---

## 5. Что НЕ входит в эту задачу

- График расходов (как у Timeweb) — отдельная задача
- Бэкенд для экспорта CSV/PDF — отдельная задача
- Переработка мобильной версии — табы стакаются автоматически
- Изменения в subscription page (`/cabinet/subscription`) — уже сделаны ранее в этой сессии
- Изменения workspace layout — не затрагивается
