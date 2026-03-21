import { Button } from "@/components/ui/button";
import { CheckSquare, FolderInput, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ElementBulkBarProps {
  selectedCount: number;
  totalCount: number;
  onDeleteSelected: () => void;
  onMoveSelected?: () => void;
  onClearSelection: () => void;
  onToggleSelectAll: () => void;
}

export function ElementBulkBar({
  selectedCount,
  totalCount,
  onDeleteSelected,
  onMoveSelected,
  onClearSelection,
  onToggleSelectAll,
}: ElementBulkBarProps) {
  if (selectedCount === 0) return null;

  const isAllSelected = selectedCount === totalCount && totalCount > 0;

  return (
    <div
      className={cn(
        "fixed bottom-24 left-1/2 -translate-x-1/2 z-50",
        "bg-background border shadow-lg rounded-md px-4 py-3",
        "flex items-center gap-4",
        "transition-transform duration-200 ease-out"
      )}
    >
      <span className="text-sm font-medium min-w-[100px]">
        {selectedCount} выбрано
      </span>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleSelectAll}
          className="gap-2 cursor-pointer transition-colors duration-200"
        >
          {isAllSelected ? (
            <>
              <X className="h-4 w-4" />
              Снять выбор
            </>
          ) : (
            <>
              <CheckSquare className="h-4 w-4" />
              Выбрать все
            </>
          )}
        </Button>

        {onMoveSelected && (
          <Button
            variant="outline"
            size="sm"
            onClick={onMoveSelected}
            className="gap-2"
          >
            <FolderInput className="h-4 w-4" />
            Переместить
          </Button>
        )}

        <Button
          variant="destructive"
          size="sm"
          onClick={onDeleteSelected}
          className="gap-2"
        >
          <Trash2 className="h-4 w-4" />
          Удалить
        </Button>

        {!isAllSelected && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            Снять выбор
          </Button>
        )}
      </div>
    </div>
  );
}
