"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { ParameterOption } from "@/lib/types";
import { AspectRatioIcon } from "./ParametersForm";

/** Common aspect ratios — used to split overflow into "Популярные" / "Расширенные" */
const POPULAR_RATIOS = new Set(["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4"]);

const selectedClass = "bg-primary text-primary-foreground border-primary shadow-sm";
const unselectedClass = "bg-card/50 border-border text-muted-foreground hover:text-foreground hover:border-primary/30";

interface OptionSelectorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  options: ParameterOption[];
  selectedValue: unknown;
  onSelect: (requestKey: string, value: unknown) => void;
  requestKey: string;
  uiSemantic?: string;
  /** Ref to the trigger button — used to position the portal panel */
  triggerRef?: React.RefObject<HTMLElement | null>;
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
  triggerRef,
}: OptionSelectorPanelProps) {
  const handleSelect = (value: unknown) => {
    onSelect(requestKey, value);
  };

  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Calculate position from trigger button
  const updatePosition = useCallback(() => {
    if (!triggerRef?.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.top, left: rect.right + 8 });
  }, [triggerRef]);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen, updatePosition]);

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
          "rounded-md text-[11px] font-normal transition-all duration-150 border",
          "flex flex-col items-center justify-center gap-1 h-14",
          isSelected ? selectedClass : unselectedClass,
        )}
      >
        {isAspectRatio && (
          <AspectRatioIcon value={String(option.value)} />
        )}
        <span>{option.label}</span>
      </button>
    );
  };

  const panel = (
    <div
      ref={panelRef}
      className={cn(
        "fixed z-[100] w-60",
        "bg-surface border border-border shadow-2xl rounded-md",
        "flex flex-col"
      )}
      style={{
        top: pos.top,
        left: pos.left,
        maxHeight: 'calc(100vh - 120px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-medium text-foreground truncate">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors text-xs"
        >
          ✕
        </button>
      </div>

      {/* Scrollable options */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin space-y-4">
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Нет доступных опций
          </p>
        ) : showGroups ? (
          <>
            <div className="space-y-2">
              <h3 className="text-xs font-normal text-muted-foreground tracking-wider">
                Популярные
              </h3>
              <div className="grid grid-cols-3 gap-1.5">
                {popular.map(renderOptionButton)}
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-xs font-normal text-muted-foreground tracking-wider">
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

  return createPortal(panel, document.body);
}
