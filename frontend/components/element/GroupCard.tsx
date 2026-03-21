'use client';

import { cn } from '@/lib/utils';
import { ASPECT_RATIO_CLASSES, CARD_ICON_SIZES, CARD_TEXT_SIZES } from '@/lib/utils/constants';
import { Folder, FolderOpen, Check, Trash2 } from 'lucide-react';
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
    countParts.push(`${childrenCount} подгрупп`);
  }
  if (elementCount > 0) {
    countParts.push(`${elementCount} элем.`);
  }
  const countLabel = countParts.length > 0 ? countParts.join(' · ') : 'Пустая группа';

  return (
    <div
      className={cn(
        'group relative rounded-xl overflow-hidden cursor-pointer',
        'border-2 border-primary/30 hover:border-primary/60',
        'bg-gradient-to-br from-zinc-900 via-zinc-800/80 to-zinc-900',
        'transition-all duration-150 ease-out',
        'hover:shadow-lg hover:shadow-primary/10',
        isSelected && 'ring-2 ring-primary border-primary',
        aspectClass,
        className,
      )}
      style={style}
      onClick={handleCardClick}
    >
      {/* Folder visual — centered icon + name */}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
        <div className="relative">
          <Folder className="w-14 h-14 text-primary/40 group-hover:hidden transition-opacity" strokeWidth={1.5} />
          <FolderOpen className="w-14 h-14 text-primary/60 hidden group-hover:block transition-opacity" strokeWidth={1.5} />
        </div>
        <span className={cn('mt-3 text-foreground font-medium text-center line-clamp-2', textSizes.title)}>
          {group.name}
        </span>
        <span className={cn('mt-1 text-muted-foreground', textSizes.meta)}>
          {countLabel}
        </span>
      </div>

      {/* Top-left: "Группа" badge */}
      <div className="absolute top-2 left-2 z-30">
        {isMultiSelectMode || isSelected ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-label={isSelected ? 'Снять выделение' : 'Выбрать'}
            onPointerDown={handleControlPointerDown}
            onClick={handleSelectClick}
            className={cn(
              'rounded-full flex items-center justify-center transition-all duration-150',
              iconSizes.padding,
              isSelected
                ? 'bg-primary text-primary-foreground'
                : 'bg-white/20 text-white hover:bg-white/40',
            )}
          >
            <Check className={iconSizes.md} />
          </button>
        ) : (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/60 bg-primary/10 px-2 py-0.5 rounded-full">
            Группа
          </span>
        )}
      </div>

      {/* Top-right: delete button on hover */}
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
            'absolute top-2 right-2 z-30 rounded-full bg-black/40 text-white hover:bg-destructive transition-colors',
            'opacity-0 group-hover:opacity-100',
            iconSizes.padding,
          )}
        >
          <Trash2 className={iconSizes.sm} />
        </button>
      )}
    </div>
  );
}
