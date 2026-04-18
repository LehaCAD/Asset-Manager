import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useFeatureGate } from "@/lib/hooks/useFeatureGate";
import { TierBadge } from "@/components/subscription/TierBadge";
import { UpgradeModal } from "@/components/subscription/UpgradeModal";
import { CheckSquare, Square, FolderInput, Trash2, Share2, Download, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ElementBulkBarProps {
  selectedCount: number;
  totalCount: number;
  onDeleteSelected: () => void;
  onMoveSelected?: () => void;
  onShareSelected?: () => void;
  onDownloadSelected?: () => void;
  onClearSelection: () => void;
  onToggleSelectAll: () => void;
  /** On mobile, bar sits above a bottom-fixed element (e.g. PromptBar). Pixels. */
  mobileBottomOffset?: number;
}

export function ElementBulkBar({
  selectedCount,
  totalCount,
  onDeleteSelected,
  onMoveSelected,
  onShareSelected,
  onDownloadSelected,
  onClearSelection,
  onToggleSelectAll,
  mobileBottomOffset = 0,
}: ElementBulkBarProps) {
  const sharing = useFeatureGate("sharing");
  const batchDownload = useFeatureGate("batch_download");

  if (selectedCount === 0) return null;

  const isAllSelected = selectedCount === totalCount && totalCount > 0;

  return (
    <>
    <div
      style={{
        ["--bulk-bar-offset" as string]: `${mobileBottomOffset}px`,
      }}
      className={cn(
        // Mobile: floats above the bottom PromptBar with matching mx-2 margins and rounded card look.
        "fixed z-50",
        "bottom-[calc(var(--bulk-bar-offset,0px)+env(safe-area-inset-bottom)+0.5rem)] left-2 right-2",
        "border rounded-lg",
        // Desktop (md+): restore the existing compact centered floating bar.
        "md:bottom-24 md:left-1/2 md:right-auto md:-translate-x-1/2",
        "md:inset-x-auto",
        "bg-background shadow-lg",
        "p-2 md:px-3 md:py-2",
        "animate-in fade-in slide-in-from-bottom-2 duration-200",
        "flex flex-col gap-2 md:flex-row md:items-center md:gap-0",
      )}
    >
      {/* Mobile header row: select-all toggle + dismiss */}
      <div className="flex md:hidden items-center justify-between">
        <button
          type="button"
          onClick={onToggleSelectAll}
          className="flex items-center gap-2 h-9 px-2 -ml-1 rounded-md text-sm hover:bg-muted transition-colors"
        >
          {isAllSelected ? (
            <CheckSquare className="h-4 w-4 text-primary" />
          ) : (
            <Square className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium tabular-nums">
            {selectedCount} из {totalCount}
          </span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClearSelection}
          className="h-9 w-9 shrink-0"
          aria-label="Снять выбор"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Desktop: select-all toggle */}
      <button
        type="button"
        onClick={onToggleSelectAll}
        className="hidden md:flex items-center gap-2 h-8 px-2 rounded-md text-sm hover:bg-muted transition-colors shrink-0"
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

      <Separator orientation="vertical" className="hidden md:block h-5 mx-1" />

      {/* Actions — mobile: 2×2 grid; desktop: inline row */}
      <div
        className={cn(
          "grid grid-cols-2 gap-1.5",
          "md:flex md:items-center md:gap-0.5",
        )}
      >
        {onShareSelected && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (sharing.isLocked) {
                sharing.openUpgrade();
                return;
              }
              onShareSelected();
            }}
            className={cn(
              "gap-1.5 text-xs font-medium",
              "h-11 w-full justify-center rounded-md border border-border bg-muted text-foreground hover:bg-muted/80",
              "md:h-8 md:w-auto md:px-3 md:border-0 md:bg-transparent md:hover:bg-muted",
            )}
          >
            <Share2 className="h-3.5 w-3.5" />
            Поделиться
            {sharing.isLocked && <TierBadge tier={sharing.tier} className="ml-1" />}
          </Button>
        )}

        {onDownloadSelected && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (batchDownload.isLocked) {
                batchDownload.openUpgrade();
                return;
              }
              onDownloadSelected();
            }}
            className={cn(
              "gap-1.5 text-xs font-medium",
              "h-11 w-full justify-center rounded-md border border-border bg-muted text-foreground hover:bg-muted/80",
              "md:h-8 md:w-auto md:px-3 md:border-0 md:bg-transparent md:hover:bg-muted",
            )}
          >
            <Download className="h-3.5 w-3.5" />
            Скачать
            {batchDownload.isLocked && <TierBadge tier={batchDownload.tier} className="ml-1" />}
          </Button>
        )}

        {onMoveSelected && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMoveSelected}
            className={cn(
              "gap-1.5 text-xs font-medium",
              "h-11 w-full justify-center rounded-md border border-border bg-muted text-foreground hover:bg-muted/80",
              "md:h-8 md:w-auto md:px-3 md:border-0 md:bg-transparent md:hover:bg-muted",
            )}
          >
            <FolderInput className="h-3.5 w-3.5" />
            Переместить
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onDeleteSelected}
          className={cn(
            "gap-1.5 text-xs font-medium text-destructive hover:text-destructive",
            "h-11 w-full justify-center rounded-md border border-destructive/40 bg-destructive/15 hover:bg-destructive/25",
            "md:h-8 md:w-auto md:px-3 md:border-0 md:bg-transparent md:hover:bg-destructive/10",
          )}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Удалить
        </Button>
      </div>

      <Separator orientation="vertical" className="hidden md:block h-5 mx-1" />

      {/* Desktop: dismiss */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onClearSelection}
        className="hidden md:inline-flex h-8 w-8 shrink-0"
        aria-label="Снять выбор"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
    <UpgradeModal
      open={sharing.upgradeOpen}
      onOpenChange={sharing.setUpgradeOpen}
      featureCode="sharing"
    />
    <UpgradeModal
      open={batchDownload.upgradeOpen}
      onOpenChange={batchDownload.setUpgradeOpen}
      featureCode="batch_download"
    />
    </>
  );
}
