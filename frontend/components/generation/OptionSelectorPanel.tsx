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
        "absolute left-full top-0 z-50 w-80",
        "bg-card border border-border shadow-2xl rounded-md",
        "flex flex-col"
      )}
      style={{ maxHeight: 'calc(100vh - 280px)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold text-foreground truncate">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors text-xs"
        >
          ✕
        </button>
      </div>

      {/* Scrollable options grid */}
      <div
        className="flex-1 overflow-y-auto p-3 scrollbar-thin"
      >
        <div className="grid grid-cols-3 gap-1.5">
          {options.length === 0 ? (
            <p className="col-span-3 text-sm text-muted-foreground text-center py-8">
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
                    "flex flex-col items-center justify-center gap-1 p-3 rounded-md text-center transition-all duration-150",
                    "border",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                  )}
                >
                  <span className="text-xs font-medium">{option.label}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
