import { cn } from "@/lib/utils";
import type { AIModel } from "@/lib/types";

interface ModelCardProps {
  model: AIModel;
  isSelected: boolean;
  onSelect: (model: AIModel) => void;
}

export function ModelCard({ model, isSelected, onSelect }: ModelCardProps) {
  const badges = model.tags;

  return (
    <button
      onClick={() => onSelect(model)}
      className={cn(
        "flex h-[94px] w-full gap-0 overflow-hidden rounded text-left transition-colors",
        isSelected
          ? "bg-primary/10 ring-1 ring-primary/30"
          : "bg-foreground/[0.03] hover:bg-foreground/[0.06]"
      )}
    >
      {/* Preview image */}
      {model.preview_url ? (
        <img
          src={model.preview_url.startsWith("http") ? model.preview_url : `/images/models/${model.preview_url}.png`}
          alt=""
          className="h-[94px] w-[94px] shrink-0 object-cover"
        />
      ) : (
        <div className="flex h-[94px] w-[94px] shrink-0 items-center justify-center bg-foreground/[0.05]">
          <div className="h-6 w-6 rounded-sm bg-muted-foreground/20" />
        </div>
      )}

      {/* Content */}
      <div className="flex flex-1 flex-col justify-center gap-1.5 px-3 py-2.5 min-w-0 overflow-hidden">
        <span className={cn(
          "text-[13px] font-medium truncate",
          isSelected ? "text-foreground" : "text-foreground/75"
        )}>
          {model.name}
        </span>

        {/* Badges */}
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {badges.map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center rounded-sm bg-foreground/[0.12] px-1.5 py-px text-[10px] text-foreground/70"
              >
                {badge}
              </span>
            ))}
          </div>
        )}

        {/* Description */}
        {model.description && (
          <span className="text-[10px] leading-snug text-muted-foreground/70 line-clamp-2">
            {model.description}
          </span>
        )}
      </div>
    </button>
  );
}
