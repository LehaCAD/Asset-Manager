import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AIModel } from "@/lib/types";

interface ModelCardProps {
  model: AIModel;
  isSelected: boolean;
  onSelect: (model: AIModel) => void;
}

export function ModelCard({ model, isSelected, onSelect }: ModelCardProps) {
  return (
    <button
      onClick={() => onSelect(model)}
      className={cn(
        "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
        "hover:bg-accent",
        isSelected && "ring-2 ring-primary bg-primary/5"
      )}
    >
      {/* Preview image */}
      {model.preview_url && (
        <img
          src={model.preview_url}
          alt=""
          className="w-12 h-12 rounded-md object-cover shrink-0"
        />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="font-medium text-sm truncate">{model.name}</p>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {model.description}
        </p>

        {/* Tags */}
        {model.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {model.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
