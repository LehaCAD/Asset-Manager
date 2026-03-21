import { cn } from "@/lib/utils";
import type { ElementFilter } from "@/lib/types";

export interface ElementFiltersProps {
  filter: ElementFilter;
  onFilterChange: (filter: ElementFilter) => void;
  // Density controls moved to DisplaySettingsPopover
  // density: GridDensity;
  // onDensityChange: (density: GridDensity) => void;
  counts: {
    all: number;
    favorites: number;
    images: number;
    videos: number;
  };
}

const filterTabs: { value: ElementFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "favorites", label: "★ Избранное" },
  { value: "images", label: "Изображения" },
  { value: "videos", label: "Видео" },
];

// Density controls moved to DisplaySettingsPopover
// const densityOptions: { value: GridDensity; icon: React.ReactNode; label: string }[] = [
//   { value: "sm", icon: <Grid3x3 className="h-4 w-4" />, label: "Мелкая сетка" },
//   { value: "md", icon: <LayoutGrid className="h-4 w-4" />, label: "Средняя сетка" },
//   { value: "lg", icon: <Square className="h-4 w-4" />, label: "Крупная сетка" },
// ];

export function ElementFilters({
  filter,
  onFilterChange,
  // density controls moved to DisplaySettingsPopover
  // density,
  // onDensityChange,
  counts,
}: ElementFiltersProps) {
  const getCount = (filterValue: ElementFilter) => {
    switch (filterValue) {
      case "all": return counts.all;
      case "favorites": return counts.favorites;
      case "images": return counts.images;
      case "videos": return counts.videos;
      default: return 0;
    }
  };

  return (
    <div className="flex items-center gap-4">
      {/* Filter tabs - left aligned */}
      <div className="flex items-center gap-1">
        {filterTabs.map((tab) => {
          const isActive = filter === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => onFilterChange(tab.value)}
              className={cn(
                "h-8 px-3 rounded-md text-xs font-medium transition-all duration-150",
                "border",
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-card"
              )}
            >
              {tab.label} ({getCount(tab.value)})
            </button>
          );
        })}
      </div>

      {/* Density controls - MOVED to DisplaySettingsPopover 
      <div className="flex items-center gap-1">
        {densityOptions.map((option) => (
          <Tooltip key={option.value}>
            <TooltipTrigger asChild>
              <Button
                variant={density === option.value ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => onDensityChange(option.value)}
              >
                {option.icon}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{option.label}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      */}
    </div>
  );
}
