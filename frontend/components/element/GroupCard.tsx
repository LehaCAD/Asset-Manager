'use client';

import { cn } from '@/lib/utils';
import { formatCurrency, formatStorage } from '@/lib/utils/format';
import { ASPECT_RATIO_CLASSES, CARD_ICON_SIZES, CARD_TEXT_SIZES } from '@/lib/utils/constants';
import { Folder, FolderOpen, Check, Trash2, Layers, HardDrive } from 'lucide-react';
import { ChargeIcon } from '@/components/ui/charge-icon';
import type { Scene, DisplayCardSize, DisplayAspectRatio, DisplayFitMode } from '@/lib/types';

export interface GroupCardProps {
  group: Scene;
  isSelected: boolean;
  isMultiSelectMode: boolean;
  onSelect: (id: number, addToSelection: boolean) => void;
  onClick: (id: number) => void;
  onDelete?: (id: number) => void;
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
  className,
  style,
  size = 'medium',
  aspectRatio = 'landscape',
}: GroupCardProps) {
  const iconSizes = CARD_ICON_SIZES[size];
  const textSizes = CARD_TEXT_SIZES[size];
  const aspectClass = ASPECT_RATIO_CLASSES[aspectRatio];

  const elementCount = group.element_count ?? group.elements_count ?? 0;

  const handleCardClick = (e: React.MouseEvent) => {
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

  return (
    <div
      className={cn(
        'group relative rounded-md overflow-hidden cursor-pointer',
        'border border-border hover:border-primary/40',
        'bg-card',
        'transition-all duration-150',
        'hover:shadow-md hover:shadow-primary/5',
        isSelected && 'ring-2 ring-primary border-primary',
        className,
      )}
      style={style}
      onClick={handleCardClick}
    >
      {/* Preview area */}
      <div className={cn('relative overflow-hidden bg-muted', aspectClass)}>
        {group.preview_thumbnails && group.preview_thumbnails.length > 0 ? (
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0.5">
            {[0, 1, 2, 3].map((i) => {
              const url = group.preview_thumbnails?.[i];
              return (
                <div key={i} className="relative overflow-hidden bg-muted">
                  {url ? (
                    <img src={url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0" />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
            <Folder className="w-10 h-10 text-primary/30 group-hover:hidden" strokeWidth={1.5} />
            <FolderOpen className="w-10 h-10 text-primary/40 hidden group-hover:block" strokeWidth={1.5} />
          </div>
        )}

        {/* Selection checkbox — overlay on preview */}
        <button
          type="button"
          role="checkbox"
          aria-checked={isSelected}
          aria-label={isSelected ? 'Снять выделение' : 'Выбрать'}
          onPointerDown={handleControlPointerDown}
          onClick={handleSelectClick}
          className={cn(
            'absolute top-2 left-2 z-30 rounded-full flex items-center justify-center transition-all duration-150',
            iconSizes.padding,
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
            <Check className={iconSizes.md} />
          ) : (
            <Check className={cn(iconSizes.md, 'opacity-0')} />
          )}
        </button>

        {/* Delete button — overlay on preview */}
        {onDelete && (
          <button
            type="button"
            aria-label="Удалить группу"
            title="Удалить группу"
            onPointerDown={handleControlPointerDown}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(group.id);
            }}
            className={cn(
              'absolute top-2 right-2 z-30 rounded-full bg-overlay text-overlay-text hover:bg-destructive transition-colors',
              'opacity-0 group-hover:opacity-100',
              iconSizes.padding,
            )}
          >
            <Trash2 className={iconSizes.sm} />
          </button>
        )}
      </div>

      {/* Info section (like ProjectCard) */}
      <div className="p-2.5 space-y-1">
        <div className="flex items-center gap-1.5">
          <Folder className="h-3.5 w-3.5 text-primary/60 shrink-0" />
          <span className={cn('font-medium line-clamp-1 group-hover:text-primary transition-colors', textSizes.title)}>
            {group.name}
          </span>
        </div>
        <div className={cn('flex items-center gap-2 text-muted-foreground', textSizes.meta)}>
          <span className="flex items-center gap-0.5">
            <Layers className="h-3 w-3" />
            {elementCount}
          </span>
          {group.total_spent && parseFloat(group.total_spent) > 0 && (
            <span className="flex items-center gap-0.5">
              <ChargeIcon size="sm" />
              {formatCurrency(group.total_spent)}
            </span>
          )}
          {(group.storage_bytes ?? 0) > 0 && (
            <span className="flex items-center gap-0.5">
              <HardDrive className="h-3 w-3" />
              {formatStorage(group.storage_bytes!)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
