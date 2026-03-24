"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { ParameterOption } from "@/lib/types";
import { AspectRatioIcon } from "./ParametersForm";

/** Common aspect ratios — used to split overflow into "Популярные" / "Расширенные" */
const POPULAR_RATIOS = new Set(["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4"]);

interface OptionSelectorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  options: ParameterOption[];
  selectedValue: unknown;
  onSelect: (requestKey: string, value: unknown) => void;
  requestKey: string;
  uiSemantic?: string;
}

export function OptionSelectorPanel({
  isOpen,
  onClose,
  title,
  options,
  selectedValue,
  onSelect,
  requestKey,
  uiSemantic,
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

  const isAspectRatio = uiSemantic === "aspect_ratio";

  // Split overflow options into popular / extended for aspect_ratio
  const popular = isAspectRatio ? options.filter((o) => POPULAR_RATIOS.has(String(o.value))) : [];
  const extended = isAspectRatio ? options.filter((o) => !POPULAR_RATIOS.has(String(o.value))) : [];
  const showGroups = isAspectRatio && popular.length > 0 && extended.length > 0;

  const renderOptionButton = (option: ParameterOption) => {
    const isSelected = option.value === selectedValue;
    return (
      <button
        key={String(option.value)}
        onClick={() => handleSelect(option.value)}
        className={cn(
          "flex flex-col items-center justify-center gap-1 p-3 rounded-md text-center transition-all duration-150",
          "border",
          isAspectRatio && "h-[72px]",
          isSelected
            ? "bg-primary text-primary-foreground border-primary shadow-sm"
            : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
        )}
      >
        {isAspectRatio && (
          <AspectRatioIcon value={String(option.value)} />
        )}
        <span className="text-xs font-medium">{option.label}</span>
      </button>
    );
  };

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

      {/* Scrollable options */}
      <div className="flex-1 overflow-y-auto p-3 scrollbar-thin space-y-4">
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Нет доступных опций
          </p>
        ) : showGroups ? (
          <>
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                Популярные
              </h3>
              <div className="grid grid-cols-3 gap-1.5">
                {popular.map(renderOptionButton)}
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                Расширенные
              </h3>
              <div className="grid grid-cols-3 gap-1.5">
                {extended.map(renderOptionButton)}
              </div>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {options.map(renderOptionButton)}
          </div>
        )}
      </div>
    </div>
  );
}
