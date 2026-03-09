"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LightboxNavigationProps {
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export function LightboxNavigation({
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: LightboxNavigationProps) {
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full",
          "bg-background/80 hover:bg-background shadow-lg backdrop-blur-sm",
          "transition-all duration-200",
          !hasPrev && "opacity-30 cursor-not-allowed"
        )}
        onClick={onPrev}
        disabled={!hasPrev}
        aria-label="Предыдущий элемент"
      >
        <ChevronLeft className="h-6 w-6" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full",
          "bg-background/80 hover:bg-background shadow-lg backdrop-blur-sm",
          "transition-all duration-200",
          !hasNext && "opacity-30 cursor-not-allowed"
        )}
        onClick={onNext}
        disabled={!hasNext}
        aria-label="Следующий элемент"
      >
        <ChevronRight className="h-6 w-6" />
      </Button>
    </>
  );
}
