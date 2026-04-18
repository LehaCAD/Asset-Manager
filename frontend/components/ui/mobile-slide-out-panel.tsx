"use client";

import * as React from "react";
import { PanelRightOpen, PanelRightClose } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface MobileSlideOutPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  /** Accessible label for the panel (hidden from sighted users). */
  title: string;
  triggerAriaLabel?: string;
  closeAriaLabel?: string;
  /** Optional badge content next to the trigger icon (e.g. comment count). */
  triggerBadge?: React.ReactNode;
  /** When true, the edge-tab trigger is suppressed (useful when outer code renders its own CTA). */
  hideTrigger?: boolean;
}

/**
 * Right-side slide-out panel for mobile (<md). Renders an edge-attached tab
 * handle that toggles the sheet. Desktop layout is untouched — use conditional
 * rendering at the call site via `md:hidden`.
 *
 * Both the closed-state trigger and the open-state close tab sit at the same
 * Y position (just under the lightbox header), so the affordance stays in
 * place when the panel animates in/out.
 */
export function MobileSlideOutPanel({
  open,
  onOpenChange,
  children,
  title,
  triggerAriaLabel,
  closeAriaLabel,
  triggerBadge,
  hideTrigger = false,
}: MobileSlideOutPanelProps) {
  const tabYClass = "top-16";

  return (
    <>
      {!hideTrigger && !open && (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-label={triggerAriaLabel ?? title}
          className={cn(
            "fixed right-0 z-[85]",
            tabYClass,
            "h-12 w-6 rounded-l-lg border border-r-0 border-border",
            "bg-card/95 backdrop-blur-sm shadow-lg",
            "flex items-center justify-center",
            "text-foreground/80 hover:text-foreground transition-colors",
          )}
        >
          <PanelRightOpen className="h-4 w-4" />
          {triggerBadge ? (
            <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-[10px] font-semibold text-primary-foreground flex items-center justify-center">
              {triggerBadge}
            </span>
          ) : null}
        </button>
      )}

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-[75vw] sm:max-w-[420px] p-0 gap-0 flex flex-col"
        >
          <SheetTitle className="sr-only">{title}</SheetTitle>
          <SheetDescription className="sr-only">{title}</SheetDescription>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={closeAriaLabel ?? `Закрыть: ${title}`}
            className={cn(
              "absolute right-full z-[1]",
              tabYClass,
              "h-12 w-6 rounded-l-lg border border-r-0 border-border",
              "bg-card/95 backdrop-blur-sm shadow-lg opacity-75",
              "flex items-center justify-center",
              "text-foreground/80 hover:text-foreground hover:opacity-100 transition",
            )}
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
          <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
