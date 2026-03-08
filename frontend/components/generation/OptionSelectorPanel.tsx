"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X } from "lucide-react";
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

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/20"
        onClick={onClose}
      />

      {/* Slide-out panel */}
      <div
        className={cn(
          "absolute left-full top-0 z-50 h-full w-72 border-r bg-background shadow-xl",
          "flex flex-col ml-0"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Options list */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
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
                      "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                      "hover:bg-accent",
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
        </ScrollArea>
      </div>
    </>
  );
}
