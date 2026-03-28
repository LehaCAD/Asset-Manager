"use client";

import * as React from "react";
import { format, subDays, startOfWeek, startOfMonth, subMonths } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "./calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover";
import { cn } from "@/lib/utils";

interface DateRangePickerProps {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
}

const PRESETS: { label: string; getValue: () => DateRange }[] = [
  {
    label: "Неделя",
    getValue: () => ({ from: subDays(new Date(), 6), to: new Date() }),
  },
  {
    label: "2 недели",
    getValue: () => ({ from: subDays(new Date(), 13), to: new Date() }),
  },
  {
    label: "Месяц",
    getValue: () => ({ from: subDays(new Date(), 29), to: new Date() }),
  },
  {
    label: "3 месяца",
    getValue: () => ({ from: subDays(new Date(), 89), to: new Date() }),
  },
];

function formatRangeLabel(range: DateRange | undefined): string {
  if (!range?.from) return "Выберите период";
  const from = format(range.from, "d MMM", { locale: ru });
  if (!range.to || range.from.getTime() === range.to.getTime()) return from;
  const to = format(range.to, "d MMM", { locale: ru });
  // If different years, show year
  if (range.from.getFullYear() !== range.to.getFullYear()) {
    const fromFull = format(range.from, "d MMM yyyy", { locale: ru });
    const toFull = format(range.to, "d MMM yyyy", { locale: ru });
    return `${fromFull} — ${toFull}`;
  }
  return `${from} — ${to}`;
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DateRange | undefined>(value);

  // Sync draft with external value when popover opens
  React.useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const applyPreset = (preset: typeof PRESETS[number]) => {
    const range = preset.getValue();
    onChange(range);
    setOpen(false);
  };

  const applyCustom = () => {
    if (draft?.from) {
      onChange(draft);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-2 h-8 px-3 rounded-lg border border-border text-xs font-medium transition-colors",
            "bg-muted/60 text-foreground hover:bg-muted",
            !value?.from && "text-muted-foreground",
            className
          )}
        >
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          {formatRangeLabel(value)}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-auto p-0 border-border bg-popover"
        sideOffset={8}
      >
        <div className="flex">
          {/* Presets */}
          <div className="flex flex-col gap-1 p-3 border-r border-border min-w-[130px]">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 px-2">
              Период
            </p>
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset)}
                className={cn(
                  "text-left px-2.5 py-1.5 rounded-md text-xs transition-colors",
                  "text-foreground/80 hover:bg-muted hover:text-foreground"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Calendar */}
          <div className="flex flex-col">
            <Calendar
              mode="range"
              selected={draft}
              onSelect={setDraft}
              numberOfMonths={2}
              disabled={{ after: new Date() }}
              defaultMonth={draft?.from ? new Date(draft.from.getFullYear(), draft.from.getMonth() - 1) : subMonths(new Date(), 1)}
            />
            <div className="flex items-center justify-between px-4 pb-3 pt-1 border-t border-border">
              <span className="text-[11px] text-muted-foreground">
                {draft?.from ? formatRangeLabel(draft) : "Выберите дату на календаре"}
              </span>
              <button
                onClick={applyCustom}
                disabled={!draft?.from}
                className="px-3.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40 transition-colors hover:bg-primary/90"
              >
                Применить
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
