import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FeatureGate } from "@/components/subscription/FeatureGate";
import { CheckSquare, Square, FolderInput, Trash2, Share2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ElementBulkBarProps {
  selectedCount: number;
  totalCount: number;
  onDeleteSelected: () => void;
  onMoveSelected?: () => void;
  onShareSelected?: () => void;
  onClearSelection: () => void;
  onToggleSelectAll: () => void;
}

export function ElementBulkBar({
  selectedCount,
  totalCount,
  onDeleteSelected,
  onMoveSelected,
  onShareSelected,
  onClearSelection,
  onToggleSelectAll,
}: ElementBulkBarProps) {
  if (selectedCount === 0) return null;

  const isAllSelected = selectedCount === totalCount && totalCount > 0;

  return (
    <div
      className={cn(
        "fixed bottom-24 left-1/2 -translate-x-1/2 z-50",
        "bg-background border shadow-lg rounded-lg px-3 py-2",
        "flex items-center gap-0",
        "animate-in fade-in slide-in-from-bottom-2 duration-200",
      )}
    >
      {/* Left: checkbox toggle + count — fixed width so bar doesn't jump */}
      <button
        type="button"
        onClick={onToggleSelectAll}
        className="flex items-center gap-2 h-8 px-2 rounded-md text-sm hover:bg-muted transition-colors shrink-0"
      >
        {isAllSelected ? (
          <CheckSquare className="h-4 w-4 text-primary" />
        ) : (
          <Square className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="font-medium tabular-nums min-w-[80px]">
          {selectedCount} из {totalCount}
        </span>
      </button>

      <Separator orientation="vertical" className="h-5 mx-1" />

      {/* Center: actions — always rendered, no conditional show/hide */}
      <div className="flex items-center gap-0.5">
        {onShareSelected && (
          <FeatureGate feature="sharing">
            <Button
              variant="ghost"
              size="sm"
              onClick={onShareSelected}
              className="gap-1.5 h-8 px-3 text-xs"
            >
              <Share2 className="h-3.5 w-3.5" />
              Поделиться
            </Button>
          </FeatureGate>
        )}

        {onMoveSelected && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMoveSelected}
            className="gap-1.5 h-8 px-3 text-xs"
          >
            <FolderInput className="h-3.5 w-3.5" />
            Переместить
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onDeleteSelected}
          className="gap-1.5 h-8 px-3 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Удалить
        </Button>
      </div>

      <Separator orientation="vertical" className="h-5 mx-1" />

      {/* Right: dismiss */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onClearSelection}
        className="h-8 w-8 shrink-0"
        aria-label="Снять выбор"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
