"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { ParameterOption } from "@/lib/types";

interface OptionSelectorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  options: ParameterOption[];
  selectedValue: unknown;
  onSelect: (requestKey: string, value: unknown) => void;
  requestKey: string;
}

export function OptionSelectorPanel({
  isOpen,
  onClose,
  title,
  options,
  selectedValue,
  onSelect,
  requestKey,
}: OptionSelectorPanelProps) {
  const handleSelect = (value: unknown) => {
    onSelect(requestKey, value);
  };

  const panelRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className={cn(
        "absolute left-full top-0 z-50 w-72",
        "bg-background shadow-2xl rounded-lg",
        "flex flex-col"
      )}
      style={{ maxHeight: 'calc(100vh - 280px)' }}
    >
      {/* Header */}
      <div className="flex items-center p-3 shrink-0">
        <h2 className="text-base font-semibold text-foreground truncate">{title}</h2>
      </div>

      {/* Scrollable options list */}
      <div 
        className="flex-1 overflow-y-auto px-3 pb-3"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--muted-foreground)) transparent' }}
      >
        <div className="space-y-2">
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Нет доступных опций
            </p>
          ) : (
            options.map((option) => {
              const isSelected = option.value === selectedValue;
              return (
                <button
                  key={String(option.value)}
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                    "bg-muted/50 hover:bg-muted",
                    isSelected && "ring-2 ring-primary bg-primary/5"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{option.label}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
