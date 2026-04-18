# Pricing, Balance & Cabinet Layout Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visually polish the pricing page (icons, recommended plan accent, trial from API), restructure balance page into tabs, and constrain cabinet layout to 1440px.

**Architecture:** Three independent frontend changes + one small backend serializer update. Pricing page already has partial changes from earlier session (Sparkles→Layers, Zap→Gift, Math.round prices, rounded-xl→rounded-lg) — this plan supersedes and completes those. Balance restructures into tab-based layout. Cabinet layout gets max-width container.

**Tech Stack:** Next.js 14, React 19, Tailwind 4, Django REST Framework, Zustand

**Spec:** `docs/superpowers/specs/2026-04-15-pricing-balance-polish-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `backend/apps/subscriptions/serializers.py` | Add trial fields to PlanListSerializer |
| Modify | `backend/apps/subscriptions/tests/test_views.py` | Update expected fields in plan test |
| Modify | `frontend/lib/types/index.ts` | Add trial fields to PlanInfo type |
| Rewrite | `frontend/app/(workspace)/pricing/page.tsx` | Full visual rework of pricing page |
| Rewrite | `frontend/app/(cabinet)/cabinet/balance/page.tsx` | Tab-based restructure |
| Modify | `frontend/components/cabinet/BalanceCard.tsx` | rounded-xl → rounded-lg |
| Modify | `frontend/components/cabinet/AmountPresets.tsx` | rounded-xl → rounded-lg |
| Modify | `frontend/components/cabinet/PaymentMethods.tsx` | rounded-xl → rounded-lg |
| Modify | `frontend/components/cabinet/TopUpSummary.tsx` | rounded-xl → rounded-lg |
| Modify | `frontend/app/(cabinet)/cabinet/layout.tsx` | Add max-w-[1440px] |

---

### Task 1: Backend — expose trial fields in plans API

**Files:**
- Modify: `backend/apps/subscriptions/serializers.py:13-29`
- Modify: `backend/apps/subscriptions/tests/test_views.py:82-91`

- [ ] **Step 1: Update test to expect new fields**

In `backend/apps/subscriptions/tests/test_views.py`, update `test_plan_fields`:

```python
def test_plan_fields(self):
    resp = self.client.get('/api/subscriptions/plans/')
    self.assertEqual(resp.status_code, 200)
    plan = resp.data[0]
    expected_fields = {
        'code', 'name', 'price', 'credits_per_month',
        'max_projects', 'max_scenes_per_project',
        'storage_limit_gb', 'features', 'is_recommended', 'display_order',
        'trial_duration_days', 'trial_bonus_credits', 'is_trial_reference',
    }
    self.assertEqual(set(plan.keys()), expected_fields)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec backend python manage.py test apps.subscriptions.tests.test_views.PlanListViewTest.test_plan_fields -v 2`

Expected: FAIL — new fields not in response.

- [ ] **Step 3: Add fields to PlanListSerializer**

In `backend/apps/subscriptions/serializers.py`, update `PlanListSerializer`:

```python
class PlanListSerializer(serializers.ModelSerializer):
    features = FeatureSerializer(many=True, read_only=True)
    trial_bonus_credits = serializers.FloatField(read_only=True)

    class Meta:
        model = Plan
        fields = [
            'code',
            'name',
            'price',
            'credits_per_month',
            'max_projects',
            'max_scenes_per_project',
            'storage_limit_gb',
            'features',
            'is_recommended',
            'display_order',
            'trial_duration_days',
            'trial_bonus_credits',
            'is_trial_reference',
        ]
```

Note: `trial_bonus_credits` is a `DecimalField` on the model. Using `FloatField` to ensure numeric output (not string). `trial_duration_days` and `is_trial_reference` are `PositiveIntegerField` and `BooleanField` — they serialize correctly by default.

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec backend python manage.py test apps.subscriptions.tests.test_views.PlanListViewTest -v 2`

Expected: All tests PASS.

- [ ] **Step 5: Run full subscriptions test suite**

Run: `docker compose exec backend python manage.py test apps.subscriptions -v 2`

Expected: All tests PASS (serializer tests also verify fields).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/subscriptions/serializers.py backend/apps/subscriptions/tests/test_views.py
git commit -m "feat(subscriptions): expose trial config fields in plans API"
```

---

### Task 2: Frontend types — add trial fields to PlanInfo

**Files:**
- Modify: `frontend/lib/types/index.ts` (PlanInfo interface)

- [ ] **Step 1: Add trial fields to PlanInfo**

Find the `PlanInfo` interface in `frontend/lib/types/index.ts` and add:

```typescript
interface PlanInfo {
  code: string;
  name: string;
  price: number;
  credits_per_month: number;
  max_projects: number;
  storage_limit_gb: number;
  features: { code: string; title: string; description: string; icon: string }[];
  is_recommended: boolean;
  display_order: number;
  trial_duration_days: number;
  trial_bonus_credits: number;
  is_trial_reference: boolean;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `docker compose exec frontend npx tsc --noEmit 2>&1 | grep -i "planinfo\|trial" | head -10`

Expected: No errors related to PlanInfo.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/types/index.ts
git commit -m "feat(types): add trial config fields to PlanInfo"
```

---

### Task 3: Pricing page — full visual rework

**Files:**
- Modify: `frontend/app/(workspace)/pricing/page.tsx`

This is the largest task. The file already has partial changes from earlier in the session (Sparkles→Layers, Zap→Gift, KadrIcon for credits, rounded-lg, Math.round). This task completes and supersedes those changes.

- [ ] **Step 1: Clean up imports AND simplify getLimitLines atomically**

These two changes must be done together (removing `LucideIcon` import breaks `getLimitLines` signature until it's updated).

Replace the current imports block (lines 1-21) with:

```typescript
import {
  Check,
  Star,
  Clock,
  Building2,
} from "lucide-react";
import { KadrIcon } from "@/components/ui/kadr-icon";
```

Remove: `X`, `FolderOpen`, `HardDrive`, `Layers`, `Gift`, `type { LucideIcon }`.

- [ ] **Step 2: Simplify getLimitLines — use Check for all, KadrIcon for credits**

Replace `getLimitLines` function:

```typescript
function getLimitLines(plan: PlanInfo): { text: string; isKadr?: boolean }[] {
  return [
    {
      text:
        plan.max_projects === 0
          ? "Безлимит проектов"
          : `До ${plan.max_projects} проектов`,
    },
    {
      text:
        plan.storage_limit_gb === 0
          ? "Безлимит хранилища"
          : `${plan.storage_limit_gb} ГБ хранилища`,
    },
    {
      isKadr: true,
      text:
        plan.credits_per_month === 0
          ? "Кадры не начисляются"
          : `${plan.credits_per_month} кадров/мес`,
    },
  ];
}
```

- [ ] **Step 3: Update PlanCard limits rendering**

In the PlanCard component, replace the limits rendering:

```tsx
{/* Limits */}
<div className="space-y-2.5 flex-1">
  {limits.map(({ text, isKadr }, i) => (
    <div key={i} className="flex items-start gap-2.5 text-sm">
      {isKadr ? (
        <KadrIcon size="md" className="shrink-0 mt-0.5" />
      ) : (
        <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      )}
      <span className="text-foreground">{text}</span>
    </div>
  ))}

  {/* Features */}
  {plan.features.length > 0 && (
    <>
      <div className="border-t border-border/50 my-2" />
      {plan.features.map((f) => (
        <div key={f.code} className="flex items-start gap-2.5 text-sm">
          <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <span className="text-foreground">{f.title}</span>
        </div>
      ))}
    </>
  )}
</div>
```

- [ ] **Step 4: Update PlanCard container styling**

**Note:** The current file has `border-primary/60` from an earlier partial edit. Replace the entire className block (the spec specifies `border-primary/40`).

Replace PlanCard's outer `<div>` className logic:

```tsx
<div
  className={[
    "rounded-lg border bg-card p-6 flex flex-col relative transition-all duration-150",
    isRecommended
      ? "border-primary/40 shadow-[0_0_20px_-4px_hsl(var(--primary)/0.25)]"
      : "border-border hover:border-[var(--border-strong)]",
  ].join(" ")}
>
  {isRecommended && (
    <div className="absolute inset-0 rounded-lg bg-primary/5 pointer-events-none" />
  )}
```

- [ ] **Step 5: Update CTA button for recommended plan**

In the CTA Button section, update the gradient className:

```tsx
cta.gradient
  ? "bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground shadow-[0_2px_12px_-2px_hsl(var(--primary)/0.4)]"
  : "",
```

- [ ] **Step 6: Update header — remove icons, add trial from API**

Replace the header section in PricingPage:

```tsx
{/* Header */}
<div className="text-center mb-12">
  <h1 className="text-3xl font-bold text-foreground">
    Тарифные планы
  </h1>
  <p className="text-base text-muted-foreground mt-3">
    Выберите тариф, который подходит вашему объёму работы
  </p>
  {!loading && !error && plans.length > 0 && (() => {
    const trialPlan = plans.find((p) => p.is_trial_reference);
    return (
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 mt-5 text-sm text-muted-foreground">
        <span>Все модели генерации доступны на любом тарифе</span>
        {trialPlan && trialPlan.trial_duration_days > 0 && (
          <>
            <span className="hidden sm:inline text-border">·</span>
            <span>
              {trialPlan.trial_duration_days} дней полного доступа
              {trialPlan.trial_bonus_credits > 0 && (
                <> + {Math.round(trialPlan.trial_bonus_credits)} Кадров</>
              )}{" "}
              новым пользователям
            </span>
          </>
        )}
      </div>
    );
  })()}
</div>
```

- [ ] **Step 7: Update ComparisonTable — replace X with dash**

In `ComparisonTable`, replace the boolean rendering:

```tsx
{typeof value === "boolean" ? (
  value ? (
    <Check className="h-4 w-4 text-primary mx-auto" />
  ) : (
    <span className="text-muted-foreground/40">—</span>
  )
) : (
  value
)}
```

- [ ] **Step 8: Verify TypeScript compiles**

Run: `docker compose exec frontend npx tsc --noEmit 2>&1 | grep "pricing" | head -10`

Expected: No errors in pricing page.

- [ ] **Step 9: Visual check in browser**

Open `http://localhost:3000/pricing` and verify:
- All feature/limit rows show Check icons (not folder/drive icons)
- KadrIcon shows for credits row
- Recommended plan has glow border and gradient CTA
- Trial line shows data (not hardcoded "7 days + 50")
- Comparison table uses dashes instead of X icons
- No Sparkles, Zap, FolderOpen, HardDrive icons anywhere

- [ ] **Step 10: Commit**

```bash
git add frontend/app/\(workspace\)/pricing/page.tsx
git commit -m "feat(pricing): visual rework — unified icons, recommended plan accent, trial from API"
```

---

### Task 4: Cabinet layout — max-width 1440px

**Files:**
- Modify: `frontend/app/(cabinet)/cabinet/layout.tsx:89`

- [ ] **Step 1: Add max-width to cabinet container**

In `frontend/app/(cabinet)/cabinet/layout.tsx`, line 89, change:

```tsx
// From:
<div className="flex flex-1 min-h-0 p-3 gap-3">

// To:
<div className="flex flex-1 min-h-0 p-3 gap-3 max-w-[1440px] mx-auto w-full">
```

- [ ] **Step 2: Visual check in browser**

Open `http://localhost:3000/cabinet/analytics` on a wide monitor and verify:
- Cabinet is centered with margins on sides
- Sidebar + content fit within 1440px
- On narrower screens (≤1440px) no visible change

- [ ] **Step 3: Commit**

```bash
git add frontend/app/\(cabinet\)/cabinet/layout.tsx
git commit -m "fix(cabinet): constrain layout to max-w-1440px for ultrawide monitors"
```

---

### Task 5: Balance page — tab restructure

**Files:**
- Rewrite: `frontend/app/(cabinet)/cabinet/balance/page.tsx`

- [ ] **Step 1: Rewrite balance page with tab structure**

Rewrite `frontend/app/(cabinet)/cabinet/balance/page.tsx` entirely. **New imports** not in the current file: `KadrIcon`, `Download`, `cn`. The file changes from a single-view page to a tabbed layout.

Complete file content:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { format, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { getTransactions } from "@/lib/api/cabinet";
import { formatDateTime, formatCurrency } from "@/lib/utils/format";
import { useCreditsStore } from "@/lib/store/credits";
import type { CabinetTransaction, PaginatedResponse } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { KadrIcon } from "@/components/ui/kadr-icon";
import { toast } from "sonner";
import { BalanceCard } from "@/components/cabinet/BalanceCard";
import { AmountPresets } from "@/components/cabinet/AmountPresets";
import { PaymentMethods } from "@/components/cabinet/PaymentMethods";
import { TopUpSummary } from "@/components/cabinet/TopUpSummary";
import { cn } from "@/lib/utils";

type Tab = "payment" | "history";

function defaultRange(): DateRange {
  const now = new Date();
  return { from: subDays(now, 89), to: now };
}

function dateRangeToParams(range: DateRange | undefined) {
  if (!range?.from) return {};
  const from = format(range.from, "yyyy-MM-dd");
  const to = range.to ? format(range.to, "yyyy-MM-dd") : from;
  return { date_from: from, date_to: to };
}

export default function BalancePage() {
  const [activeTab, setActiveTab] = useState<Tab>("payment");
  const [data, setData] = useState<PaginatedResponse<CabinetTransaction> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(defaultRange);
  const loadBalance = useCreditsStore((s) => s.loadBalance);

  useEffect(() => { loadBalance(); }, [loadBalance]);

  const load = useCallback(async () => {
    setLoading(true);
    if (page === 1) setError(false);
    try {
      const result = await getTransactions({
        page,
        reason: "admin_topup",
        ...dateRangeToParams(dateRange),
      });
      setData(result);
    } catch {
      if (page === 1) {
        setError(true);
      } else {
        toast.error("Не удалось загрузить данные");
      }
    } finally {
      setLoading(false);
    }
  }, [page, dateRange]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [dateRange]);

  const totalPages = data ? Math.ceil(data.count / 20) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Платежи</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Управляйте балансом и просматривайте историю пополнений
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border">
        {([
          { id: "payment" as Tab, label: "Оплата" },
          { id: "history" as Tab, label: "История операций" },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors -mb-px",
              activeTab === tab.id
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Payment */}
      {activeTab === "payment" && (
        <div className="mx-auto max-w-[520px] space-y-5">
          <BalanceCard />
          <AmountPresets />
          <PaymentMethods />
          <TopUpSummary />
        </div>
      )}

      {/* Tab: History */}
      {activeTab === "history" && (
        <>
          {/* History header with filters */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">
              История операций
            </h2>
            <div className="flex items-center gap-2">
              <DateRangePicker value={dateRange} onChange={setDateRange} />
              <button
                disabled
                title="Скоро"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground opacity-50 cursor-not-allowed"
              >
                <Download className="h-3.5 w-3.5" />
                Скачать
              </button>
            </div>
          </div>

          {error ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-10 w-10 rounded-md bg-destructive/10 flex items-center justify-center mb-3">
                <AlertCircle className="h-5 w-5 text-destructive" />
              </div>
              <p className="text-sm font-medium text-foreground">Не удалось загрузить данные</p>
              <p className="text-xs text-muted-foreground mt-1">Попробуйте обновить страницу</p>
              <button
                onClick={() => { setError(false); load(); }}
                className="mt-3 px-3 py-1.5 text-xs rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Повторить
              </button>
            </div>
          ) : (
            <>
              {/* Transactions table — 4 columns (removed "Способ") */}
              <div className="rounded-lg border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Дата</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Описание</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Сумма</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Статус</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {loading ? (
                      [...Array(3)].map((_, i) => (
                        <tr key={i}>
                          {[...Array(4)].map((_, j) => (
                            <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                          ))}
                        </tr>
                      ))
                    ) : data && data.results.length > 0 ? (
                      data.results.map((tx) => (
                        <tr key={tx.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap text-[11px]">
                            {formatDateTime(tx.created_at)}
                          </td>
                          <td className="px-4 py-3 text-foreground">
                            Пополнение баланса
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-1 font-mono font-medium text-success">
                              +{formatCurrency(tx.amount)}
                              <KadrIcon size="xs" />
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-1 text-[10px] text-success font-medium">
                              <CheckCircle2 className="h-3 w-3" />
                              Оплачено
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-16 text-center text-muted-foreground">
                          Нет операций за выбранный период
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {data && data.count > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {`${(page - 1) * 20 + 1}–${Math.min(page * 20, data.count)} из ${data.count}`}
                  </span>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="p-2 rounded-md bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="text-xs text-muted-foreground font-mono">{page} / {totalPages}</span>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="p-2 rounded-md bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
```

Key changes from current code:
- **New imports** (not in current file): `KadrIcon`, `Download`, `cn`
- Added tab state (`activeTab`) and tab bar UI
- Payment form wrapped in "payment" tab with `max-w-[520px] mx-auto`
- History table moved into "history" tab
- Removed "Способ" column (5→4 columns, `Array(5)`→`Array(4)`, `colSpan={5}`→`colSpan={4}`)
- Added `KadrIcon` next to amount in transaction rows
- Added disabled "Скачать" button in history header
- `rounded-md` → `rounded-lg` on table container
- Empty state text: "Нет операций за выбранный период" (was "пополнений")

- [ ] **Step 2: Verify TypeScript compiles**

Run: `docker compose exec frontend npx tsc --noEmit 2>&1 | grep "balance" | head -10`

Expected: No errors.

- [ ] **Step 3: Visual check in browser**

Open `http://localhost:3000/cabinet/balance`:
- Two tabs visible: "Оплата" (active by default) and "История операций"
- Payment tab shows the form centered at 520px
- History tab shows transactions table without "Способ" column
- "Скачать" button disabled with tooltip
- Tab switching works smoothly

- [ ] **Step 4: Commit**

```bash
git add frontend/app/\(cabinet\)/cabinet/balance/page.tsx
git commit -m "feat(balance): restructure into tabs — Payment and History (Timeweb-inspired)"
```

---

### Task 6: Balance components — rounded-xl → rounded-lg

**Files:**
- Modify: `frontend/components/cabinet/BalanceCard.tsx`
- Modify: `frontend/components/cabinet/AmountPresets.tsx`
- Modify: `frontend/components/cabinet/PaymentMethods.tsx`
- Modify: `frontend/components/cabinet/TopUpSummary.tsx`

- [ ] **Step 1: Replace rounded-xl with rounded-lg in all 4 files**

In each file, replace all occurrences of `rounded-xl` with `rounded-lg`:

- `BalanceCard.tsx`: line with `rounded-xl border` → `rounded-lg border`
- `AmountPresets.tsx`: outer container `rounded-xl` → `rounded-lg`
- `PaymentMethods.tsx`: outer container `rounded-xl` → `rounded-lg`
- `TopUpSummary.tsx`: outer container `rounded-xl` → `rounded-lg`

- [ ] **Step 2: Visual check**

Open `http://localhost:3000/cabinet/balance` — verify all cards have consistent 8px radius (not 12px).

- [ ] **Step 3: Commit**

```bash
git add frontend/components/cabinet/BalanceCard.tsx frontend/components/cabinet/AmountPresets.tsx frontend/components/cabinet/PaymentMethods.tsx frontend/components/cabinet/TopUpSummary.tsx
git commit -m "fix(balance): rounded-xl → rounded-lg per brandbook (max 8px)"
```

---

## Execution Order

Tasks 1→2 must be sequential (backend first, then types). Tasks 3-6 are independent of each other but depend on Task 2. Suggested order:

1. **Task 1** — Backend serializer (unblocks frontend trial data)
2. **Task 2** — Frontend types (unblocks pricing page)
3. **Task 4** — Cabinet layout (smallest, quick win)
4. **Task 6** — Balance components rounded-lg (small, quick)
5. **Task 3** — Pricing page (largest task)
6. **Task 5** — Balance page tabs (second largest)
