"use client";

import { useEffect, useState } from "react";
import { Eye, Grid3x3, LayoutGrid, Square, RectangleHorizontal, RectangleVertical, Maximize, Shrink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDisplayStore } from "@/lib/store/project-display";
import { cn } from "@/lib/utils";
import type { DisplayCardSize, DisplayAspectRatio, DisplayFitMode } from "@/lib/types";

interface OptionButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel: string;
}

function OptionButton({ active, onClick, children, className, ariaLabel }: OptionButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center rounded transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function DisplaySettingsPopover() {
  const { preferences, updatePreferences, hydratePreferences } = useDisplayStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    hydratePreferences();
  }, [hydratePreferences]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center justify-center gap-1.5 h-9 w-9 sm:w-auto sm:h-7 sm:px-3 rounded-md sm:rounded text-xs font-medium text-muted-foreground bg-card hover:text-foreground transition-colors"
          aria-label="Настройки отображения"
          title="Настройки отображения"
        >
          <Eye className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          <span className="hidden sm:inline">Вид</span>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-[200px] p-0 border-0" align="end" side="bottom" sideOffset={4}>
        <div className="rounded-lg bg-card p-2.5 space-y-2">
          {/* Title */}
          <span className="text-[13px] font-semibold text-foreground">Отображение</span>

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* Size — meaningless on mobile (grid density is dictated by aspect ratio).
              Hide on <sm. */}
          <div className="hidden sm:block space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Размер</span>
            <div className="grid grid-cols-3 gap-1">
              <OptionButton
                active={preferences.size === "compact"}
                onClick={() => updatePreferences({ size: "compact" })}
                ariaLabel="Компактный"
                className="h-8"
              >
                <Grid3x3 className="h-4 w-4" />
              </OptionButton>
              <OptionButton
                active={preferences.size === "medium"}
                onClick={() => updatePreferences({ size: "medium" })}
                ariaLabel="Средний"
                className="h-8"
              >
                <LayoutGrid className="h-4 w-4" />
              </OptionButton>
              <OptionButton
                active={preferences.size === "large"}
                onClick={() => updatePreferences({ size: "large" })}
                ariaLabel="Крупный"
                className="h-8"
              >
                <Square className="h-4 w-4" />
              </OptionButton>
            </div>
          </div>

          {/* Divider — hidden on mobile (next to hidden size block) */}
          <div className="hidden sm:block h-px bg-border" />

          {/* Aspect Ratio */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Соотношение сторон</span>
            <div className="grid grid-cols-3 gap-1">
              <OptionButton
                active={preferences.aspectRatio === "landscape"}
                onClick={() => updatePreferences({ aspectRatio: "landscape" })}
                ariaLabel="Горизонтальный"
                className="h-8"
              >
                <RectangleHorizontal className="h-4 w-4" />
              </OptionButton>
              <OptionButton
                active={preferences.aspectRatio === "square"}
                onClick={() => updatePreferences({ aspectRatio: "square" })}
                ariaLabel="Квадрат"
                className="h-8"
              >
                <Square className="h-4 w-4" />
              </OptionButton>
              <OptionButton
                active={preferences.aspectRatio === "portrait"}
                onClick={() => updatePreferences({ aspectRatio: "portrait" })}
                ariaLabel="Вертикальный"
                className="h-8"
              >
                <RectangleVertical className="h-4 w-4" />
              </OptionButton>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* Fit Mode */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Режим отображения</span>
            <div className="grid grid-cols-2 gap-1">
              <OptionButton
                active={preferences.fitMode === "fill"}
                onClick={() => updatePreferences({ fitMode: "fill" })}
                ariaLabel="Заполнить"
                className="h-[52px] flex-col gap-1"
              >
                <Maximize className="h-4 w-4" />
                <span className="text-[9px] font-medium">Заполнить</span>
              </OptionButton>
              <OptionButton
                active={preferences.fitMode === "fit"}
                onClick={() => updatePreferences({ fitMode: "fit" })}
                ariaLabel="Целиком"
                className="h-[52px] flex-col gap-1"
              >
                <Shrink className="h-4 w-4" />
                <span className="text-[9px] font-medium">Целиком</span>
              </OptionButton>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Metadata toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Доп. данные</span>
            <Switch
              checked={preferences.showMetadata}
              onCheckedChange={(checked) => updatePreferences({ showMetadata: checked })}
              className="scale-75"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
