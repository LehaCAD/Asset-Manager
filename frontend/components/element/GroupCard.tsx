'use client';

import { cn } from '@/lib/utils';
import { ASPECT_RATIO_CLASSES, FIT_MODE_CLASSES, CARD_ICON_SIZES, CARD_TEXT_SIZES } from '@/lib/utils/constants';
import { Folder, Check, Trash2 } from 'lucide-react';
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
  fitMode = 'fill',
}: GroupCardProps) {
  const iconSizes = CARD_ICON_SIZES[size];
  const textSizes = CARD_TEXT_SIZES[size];
  const aspectClass = ASPECT_RATIO_CLASSES[aspectRatio];
  const fitClass = FIT_MODE_CLASSES[fitMode];

  const thumbnailSrc = group.headliner_thumbnail_url?.trim() || group.headliner_url?.trim() || null;
  const elementCount = group.element_count ?? group.elements_count ?? 0;
  const childrenCount = group.children_count ?? 0;

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

  // Build count label
  const countParts: string[] = [];
  if (childrenCount > 0) {
    countParts.push(`${childrenCount} гр.`);
  }
  if (elementCount > 0) {
    countParts.push(`${elementCount} эл.`);
  }
  const countLabel = countParts.length > 0 ? countParts.join(', ') : 'Пусто';

  return (
    <div
      className={cn(
        'group relative rounded-xl overflow-hidden cursor-pointer',
        'border-2 border-dashed border-zinc-600',
        'bg-muted transition-transform duration-150 ease-out',
        'hover:scale-[1.02] hover:shadow-lg hover:border-zinc-500',
        isSelected && 'ring-2 ring-primary scale-[1.01] border-primary',
        aspectClass,
        className,
      )}
      style={style}
      onClick={handleCardClick}
    >
      {/* Preview image or placeholder */}
      {thumbnailSrc ? (
        <img
          src={thumbnailSrc}
          alt={group.name}
          loading="lazy"
          decoding="async"
          className={cn('absolute inset-0 w-full h-full bg-muted', fitClass)}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
          <Folder className="w-12 h-12 text-zinc-600" />
        </div>
      )}

      {/* Selection checkbox */}
      <button
        type="button"
        role="checkbox"
        aria-checked={isSelected}
        aria-label={isSelected ? 'Снять выделение группы' : 'Выбрать группу'}
        title={isSelected ? 'Снять выделение' : 'Выбрать'}
        onPointerDown={handleControlPointerDown}
        onClick={handleSelectClick}
        className={cn(
          'absolute top-2 left-2 z-40 rounded-full flex items-center justify-center transition-all duration-150',
          iconSizes.padding,
          isMultiSelectMode || isSelected
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto',
          isSelected
            ? 'bg-primary text-primary-foreground'
            : 'bg-black/50 text-white hover:bg-black/70',
          isMultiSelectMode && !isSelected && 'bg-white/40 hover:bg-white/60',
        )}
      >
        {isSelected ? (
          <Check className={iconSizes.md} />
        ) : (
          <Check className={cn(iconSizes.md, 'opacity-0')} />
        )}
      </button>

      {/* Top right controls */}
      <div className="absolute top-2 right-2 z-40 flex items-center gap-1">
        {/* Delete button (visible on hover) */}
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
              'rounded-full bg-black/50 text-white hover:bg-destructive transition-colors',
              'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto',
              iconSizes.padding,
            )}
          >
            <Trash2 className={iconSizes.sm} />
          </button>
        )}
        {/* Folder badge */}
        <div
          className={cn(
            'rounded-full bg-black/50 text-white',
            iconSizes.padding,
          )}
          title="Группа"
        >
          <Folder className={iconSizes.sm} />
        </div>
      </div>

      {/* Bottom bar with name and count */}
      <div className="absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Folder className={cn(iconSizes.sm, 'text-zinc-400 shrink-0')} />
          <span className={cn(textSizes.title, 'text-white font-medium truncate')}>
            {group.name}
          </span>
        </div>
        <p className={cn(textSizes.meta, 'text-zinc-400 mt-0.5')}>
          {countLabel}
        </p>
      </div>

      {/* Hover overlay */}
      <div
        className={cn(
          'absolute inset-0 z-20 bg-black/30',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
        )}
      />
    </div>
  );
}
