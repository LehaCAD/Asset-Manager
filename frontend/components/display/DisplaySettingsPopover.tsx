"use client";

import { useEffect, useState } from "react";
import { Eye, Grid3x3, LayoutGrid, Square, RectangleHorizontal, RectangleVertical, Maximize, Shrink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDisplayStore } from "@/lib/store/project-display";
import { cn } from "@/lib/utils";
import type { DisplayCardSize, DisplayAspectRatio, DisplayFitMode } from "@/lib/types";

// Компонент кнопки-триггера
function EyeButton({ className }: { className?: string }) {
  return (
    <Button 
      variant="ghost" 
      size="icon" 
      className={cn("h-8 w-8", className)}
      aria-label="Настройки отображения"
    >
      <Eye className="h-4 w-4" />
    </Button>
  );
}

export function DisplaySettingsPopover() {
  const { preferences, updatePreferences, hydratePreferences } = useDisplayStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    hydratePreferences();
  }, [hydratePreferences]);

  const handleSizeChange = (value: string) => {
    if (value) updatePreferences({ size: value as DisplayCardSize });
  };

  const handleAspectRatioChange = (value: string) => {
    if (value) updatePreferences({ aspectRatio: value as DisplayAspectRatio });
  };

  const handleFitModeChange = (value: string) => {
    if (value) updatePreferences({ fitMode: value as DisplayFitMode });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {open ? (
        <PopoverTrigger asChild>
          <span>
            <EyeButton />
          </span>
        </PopoverTrigger>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <span>
                <EyeButton />
              </span>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Отображение</p>
          </TooltipContent>
        </Tooltip>
      )}

      <PopoverContent className="w-64 p-3" align="end" side="bottom" sideOffset={4}>
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Отображение</span>
          </div>

          <Separator />

          {/* Size */}
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground">Размер</span>
            <ToggleGroup 
              type="single" 
              value={preferences.size} 
              onValueChange={handleSizeChange}
              className="grid grid-cols-3 gap-1"
            >
              <ToggleGroupItem 
                value="compact" 
                aria-label="Компактный"
                className={cn(
                  "flex flex-col items-center gap-1 h-auto py-2 px-1 transition-all",
                  "data-[state=off]:bg-muted/40 data-[state=off]:hover:bg-muted",
                  "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                )}
              >
                <Grid3x3 className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="medium" 
                aria-label="Средний"
                className={cn(
                  "flex flex-col items-center gap-1 h-auto py-2 px-1 transition-all",
                  "data-[state=off]:bg-muted/40 data-[state=off]:hover:bg-muted",
                  "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="large" 
                aria-label="Крупный"
                className={cn(
                  "flex flex-col items-center gap-1 h-auto py-2 px-1 transition-all",
                  "data-[state=off]:bg-muted/40 data-[state=off]:hover:bg-muted",
                  "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                )}
              >
                <Square className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <Separator />

          {/* Aspect Ratio */}
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground">Соотношение сторон</span>
            <ToggleGroup 
              type="single" 
              value={preferences.aspectRatio} 
              onValueChange={handleAspectRatioChange}
              className="grid grid-cols-3 gap-1"
            >
              <ToggleGroupItem 
                value="landscape" 
                aria-label="Горизонтальный"
                className={cn(
                  "flex flex-col items-center gap-1 h-auto py-2 px-1 transition-all",
                  "data-[state=off]:bg-muted/40 data-[state=off]:hover:bg-muted",
                  "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                )}
              >
                <RectangleHorizontal className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="square" 
                aria-label="Квадрат"
                className={cn(
                  "flex flex-col items-center gap-1 h-auto py-2 px-1 transition-all",
                  "data-[state=off]:bg-muted/40 data-[state=off]:hover:bg-muted",
                  "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                )}
              >
                <Square className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="portrait" 
                aria-label="Вертикальный"
                className={cn(
                  "flex flex-col items-center gap-1 h-auto py-2 px-1 transition-all",
                  "data-[state=off]:bg-muted/40 data-[state=off]:hover:bg-muted",
                  "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                )}
              >
                <RectangleVertical className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <Separator />

          {/* Fit Mode */}
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground">Режим отображения</span>
            <ToggleGroup 
              type="single" 
              value={preferences.fitMode} 
              onValueChange={handleFitModeChange}
              className="grid grid-cols-2 gap-1"
            >
              <ToggleGroupItem 
                value="fill" 
                aria-label="Заполнить"
                className={cn(
                  "flex flex-col items-center gap-1 h-auto py-2 px-1 transition-all",
                  "data-[state=off]:bg-muted/40 data-[state=off]:hover:bg-muted",
                  "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                )}
              >
                <Maximize className="h-4 w-4" />
                <span className="text-[10px]">Заполнить</span>
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="fit" 
                aria-label="Целиком"
                className={cn(
                  "flex flex-col items-center gap-1 h-auto py-2 px-1 transition-all",
                  "data-[state=off]:bg-muted/40 data-[state=off]:hover:bg-muted",
                  "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                )}
              >
                <Shrink className="h-4 w-4" />
                <span className="text-[10px]">Целиком</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
