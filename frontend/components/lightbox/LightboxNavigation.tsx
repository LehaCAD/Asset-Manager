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
          "absolute left-2 md:left-4 top-1/2 -translate-y-1/2 rounded-full",
          "h-8 w-8 md:h-12 md:w-12",
          "bg-background border border-border shadow-md",
          "md:bg-background/80 md:border-transparent md:backdrop-blur-sm md:shadow-lg md:hover:bg-background",
          "transition-all duration-200",
          !hasPrev && "opacity-30 cursor-not-allowed"
        )}
        onClick={onPrev}
        disabled={!hasPrev}
        aria-label="Предыдущий элемент"
      >
        <ChevronLeft className="h-4 w-4 md:h-6 md:w-6" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "absolute right-2 md:right-4 top-1/2 -translate-y-1/2 rounded-full",
          "h-8 w-8 md:h-12 md:w-12",
          "bg-background border border-border shadow-md",
          "md:bg-background/80 md:border-transparent md:backdrop-blur-sm md:shadow-lg md:hover:bg-background",
          "transition-all duration-200",
          !hasNext && "opacity-30 cursor-not-allowed"
        )}
        onClick={onNext}
        disabled={!hasNext}
        aria-label="Следующий элемент"
      >
        <ChevronRight className="h-4 w-4 md:h-6 md:w-6" />
      </Button>
    </>
  );
}
