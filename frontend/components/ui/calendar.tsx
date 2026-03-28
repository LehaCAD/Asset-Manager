"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={ru}
      className={cn("p-3 relative", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4 relative",
        month: "flex flex-col gap-4",
        month_caption: "flex justify-center pt-1 relative items-center h-8",
        caption_label: "text-sm font-medium text-foreground",
        nav: "absolute top-3 left-0 right-0 flex items-center justify-between z-10 px-1",
        button_previous: cn(
          "h-7 w-7 bg-transparent p-0 inline-flex items-center justify-center rounded-md",
          "text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        ),
        button_next: cn(
          "h-7 w-7 bg-transparent p-0 inline-flex items-center justify-center rounded-md",
          "text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "text-muted-foreground rounded-md w-8 font-normal text-[0.65rem] uppercase text-center",
        week: "flex w-full mt-1",
        day: cn(
          "relative p-0 text-center text-xs focus-within:relative focus-within:z-20",
          "[&:has([aria-selected])]:bg-primary/10",
          "[&:has([aria-selected].day-range-end)]:rounded-r-md",
          "[&:has([aria-selected].day-outside)]:bg-primary/5",
          "first:[&:has([aria-selected])]:rounded-l-md",
          "last:[&:has([aria-selected])]:rounded-r-md"
        ),
        day_button: cn(
          "h-8 w-8 p-0 font-normal inline-flex items-center justify-center rounded-md transition-colors",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "aria-selected:opacity-100"
        ),
        range_start: "day-range-start rounded-l-md",
        range_end: "day-range-end rounded-r-md",
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        today: "bg-accent text-accent-foreground",
        outside:
          "day-outside text-muted-foreground/40 aria-selected:bg-primary/5 aria-selected:text-muted-foreground/60",
        disabled: "text-muted-foreground/30 cursor-not-allowed",
        range_middle:
          "aria-selected:bg-primary/10 aria-selected:text-foreground",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
