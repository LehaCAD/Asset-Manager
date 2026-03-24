"use client";

import { useState } from "react";
import { Image, Video, Star, Filter } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ElementFilter } from "@/lib/types";

export interface ElementFiltersProps {
  filter: ElementFilter;
  onFilterChange: (filter: ElementFilter) => void;
  counts: {
    all: number;
    favorites: number;
    images: number;
    videos: number;
  };
}

const filterTabs: { value: ElementFilter; label: string; icon?: React.ComponentType<{ className?: string }> }[] = [
  { value: "all", label: "Все" },
  { value: "favorites", label: "Избранное", icon: Star },
  { value: "images", label: "Изображения", icon: Image },
  { value: "videos", label: "Видео", icon: Video },
];

export function ElementFilters({
  filter,
  onFilterChange,
  counts,
}: ElementFiltersProps) {
  const [open, setOpen] = useState(false);

  const getCount = (filterValue: ElementFilter) => {
    switch (filterValue) {
      case "all": return counts.all;
      case "favorites": return counts.favorites;
      case "images": return counts.images;
      case "videos": return counts.videos;
      default: return 0;
    }
  };

  const activeTab = filterTabs.find((t) => t.value === filter);
  const isFiltered = filter !== "all";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 h-7 px-3 rounded text-xs font-medium transition-colors",
            isFiltered
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:text-foreground"
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          {isFiltered ? `${activeTab?.label} (${getCount(filter)})` : "Фильтры"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-1.5" align="start" sideOffset={4}>
        <div className="flex flex-col gap-1">
          {filterTabs.map((tab) => {
            const isActive = filter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => {
                  onFilterChange(tab.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center gap-2 h-8 px-3 rounded text-xs font-medium transition-colors text-left",
                  isActive
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-card"
                )}
              >
                {tab.icon && <tab.icon className="h-3.5 w-3.5" />}
                <span className="flex-1">{tab.label}</span>
                <span className={cn("tabular-nums", isActive ? "text-primary-foreground/70" : "text-muted-foreground/50")}>
                  {getCount(tab.value)}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
