'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatStorage, formatCurrency } from '@/lib/utils/format';
import { BADGE_MD } from '@/lib/utils/constants';
import { useSubscriptionStore } from '@/lib/store/subscription';
import { ProBadge } from '@/components/subscription/ProBadge';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import { Layers, Check, Trash2, HardDrive, MoreHorizontal, Pencil, Share2, ImageIcon } from 'lucide-react';
import { ChargeIcon } from '@/components/ui/charge-icon';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Scene, DisplayCardSize, DisplayAspectRatio, DisplayFitMode } from '@/lib/types';

// Stack offset per layer — uniform in both X and Y
const STACK_STEP: Record<DisplayCardSize, number> = {
  compact: 4,
  medium: 5,
  large: 6,
};

export interface GroupCardProps {
  group: Scene;
  isSelected: boolean;
  isMultiSelectMode: boolean;
  onSelect: (id: number, addToSelection: boolean) => void;
  onClick: (id: number) => void;
  onDelete?: (id: number) => void;
  onRename?: (id: number) => void;
  onShare?: (id: number) => void;
  isDropTarget?: boolean;
  className?: string;
  style?: React.CSSProperties;
  size?: DisplayCardSize;
  aspectRatio?: DisplayAspectRatio;
  fitMode?: DisplayFitMode;
}

export function GroupCard({
  group,
  isSelected,
  isMultiSelectMode,
  onSelect,
  onClick,
  onDelete,
  onRename,
  onShare,
  isDropTarget = false,
  className,
  style,
  size = 'medium',
}: GroupCardProps) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const hasFeature = useSubscriptionStore((s) => s.hasFeature);
  const canShare = hasFeature("sharing");
  const elementCount = group.element_count ?? group.elements_count ?? 0;
  const headlinerUrl = group.headliner_thumbnail_url || group.headliner_url || (group.preview_thumbnails && group.preview_thumbnails.length > 0 ? group.preview_thumbnails[0] : null);

  // Stack: 2 layers behind front card, each offset by `step` up and right
  // All three are the SAME size, determined by the grid cell
  const step = STACK_STEP[size];
  const totalPad = step * 2;

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-navigate]')) return;
    if (e.ctrlKey || e.metaKey || isMultiSelectMode) {
      onSelect(group.id, true);
    } else {
      onClick(group.id);
    }
  };

  const handleSelectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(group.id, true);
  };

  const handleControlPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  const blockNav = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <>
    <div
      className={cn('group relative cursor-pointer', className)}
      style={{ paddingTop: totalPad, ...style }}
      onClick={handleCardClick}
    >
      {/* Stack layer 2 (back) — darkest: card + 6% black overlay */}
      <div
        className={cn(
          'absolute rounded-md border shadow-sm transition-colors duration-150 bg-card pointer-events-none',
          isSelected
            ? 'border-primary/25'
            : 'border-border group-hover:border-primary/30',
        )}
        style={{ left: totalPad, right: 0, top: 0, bottom: totalPad }}
      >
        <div className="absolute inset-0 rounded-md bg-black/[0.06] dark:bg-black/[0.15]" />
      </div>

      {/* Stack layer 1 (middle) — slightly darker: card + 3% black overlay */}
      <div
        className={cn(
          'absolute rounded-md border shadow-sm transition-colors duration-150 bg-card pointer-events-none',
          isSelected
            ? 'border-primary/30'
            : 'border-border group-hover:border-primary/35',
        )}
        style={{ left: step, right: step, top: step, bottom: step }}
      >
        <div className="absolute inset-0 rounded-md bg-black/[0.03] dark:bg-black/[0.08]" />
      </div>

      {/* Front card — bottom-left */}
      <div
        className={cn(
          'relative rounded-md overflow-hidden transition-all duration-150 flex flex-col',
          'shadow-sm hover:shadow-md hover:shadow-primary/5',
          isSelected
            ? 'bg-card border-2 border-primary'
            : 'bg-card border border-border hover:border-primary/40',
          isDropTarget && 'ring-2 ring-primary bg-primary/[0.04] border-primary',
        )}
        style={{ marginRight: totalPad }}
      >
        {/* Preview area — aspect-video with air padding */}
        <div className="p-1.5">
          <div className="aspect-video rounded-md overflow-hidden">
            {headlinerUrl ? (
              <img
                src={headlinerUrl}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-background flex flex-col items-center justify-center gap-2">
                <ImageIcon className="w-10 h-10 text-muted-foreground/15" strokeWidth={1.5} />
                <span className="text-xs text-muted-foreground/30">Пусто</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-3.5 py-3 space-y-1.5 border-t border-border">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="block text-base font-medium line-clamp-1 text-foreground group-hover:text-primary transition-colors flex-1 min-w-0">
              {group.name}
            </span>
            <div className="shrink-0" data-no-navigate>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:bg-muted"
                    aria-label="Действия"
                    onPointerDown={handleControlPointerDown}
                    onClick={blockNav}
                  >
                    <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44" onClick={blockNav}>
                  {onRename && (
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onSelect={(e) => { e.preventDefault(); e.stopPropagation(); onRename(group.id); }}
                    >
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Переименовать
                    </DropdownMenuItem>
                  )}
                  {onShare && (
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onSelect={() => {
                        if (!canShare) {
                          setUpgradeOpen(true);
                          return;
                        }
                        onShare(group.id);
                      }}
                    >
                      <Share2 className="mr-2 h-3.5 w-3.5" />
                      Поделиться
                      {!canShare && <ProBadge className="ml-auto" />}
                    </DropdownMenuItem>
                  )}
                  {(onRename || onShare) && onDelete && <DropdownMenuSeparator />}
                  {onDelete && (
                    <DropdownMenuItem
                      className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                      onSelect={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(group.id); }}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Удалить
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Layers className="h-3 w-3" />
              {elementCount}
            </span>
            {group.total_spent && parseFloat(group.total_spent) > 0 && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="flex items-center gap-0.5">
                  <ChargeIcon size="xs" />
                  {formatCurrency(group.total_spent)}
                </span>
              </>
            )}
            {(group.storage_bytes ?? 0) > 0 && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="flex items-center gap-0.5">
                  <HardDrive className="h-3 w-3" />
                  {formatStorage(group.storage_bytes!)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Selection checkbox */}
        <button
          type="button"
          role="checkbox"
          aria-checked={isSelected}
          aria-label={isSelected ? 'Снять выделение' : 'Выбрать'}
          onPointerDown={handleControlPointerDown}
          onClick={handleSelectClick}
          className={cn(
            'absolute top-3 left-3 z-30 rounded-md flex items-center justify-center transition-all duration-150',
            BADGE_MD.padding,
            isMultiSelectMode || isSelected
              ? 'opacity-100 pointer-events-auto'
              : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto',
            isSelected
              ? 'bg-primary text-primary-foreground'
              : 'bg-overlay text-overlay-text hover:bg-overlay-heavy',
            isMultiSelectMode && !isSelected && 'bg-overlay-selection hover:bg-overlay-selection-hover',
          )}
        >
          {isSelected ? (
            <Check className={BADGE_MD.icon} />
          ) : (
            <Check className={cn(BADGE_MD.icon, 'opacity-0')} />
          )}
        </button>
      </div>
    </div>
    <UpgradeModal
      open={upgradeOpen}
      onOpenChange={setUpgradeOpen}
      featureCode="sharing"
    />
    </>
  );
}
