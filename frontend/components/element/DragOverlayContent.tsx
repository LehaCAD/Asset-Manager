'use client';

import type { WorkspaceElement, Scene, DisplayCardSize, DisplayAspectRatio, DisplayFitMode } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CARD_SIZES, GROUP_CARD_SIZES, ASPECT_RATIO_CLASSES, FIT_MODE_CLASSES } from '@/lib/utils/constants';
import { Folder } from 'lucide-react';

interface DragOverlayContentProps {
  type: 'element' | 'group';
  element?: WorkspaceElement;
  group?: Scene;
  additionalCount: number;
  size: DisplayCardSize;
  aspectRatio: DisplayAspectRatio;
  fitMode: DisplayFitMode;
}

export function DragOverlayContent({
  type,
  element,
  group,
  additionalCount,
  size,
  aspectRatio,
  fitMode,
}: DragOverlayContentProps) {
  if (type === 'element' && element) {
    const cardDims = CARD_SIZES[size][aspectRatio];
    const arClass = ASPECT_RATIO_CLASSES[aspectRatio];
    const fitClass = FIT_MODE_CLASSES[fitMode];

    return (
      <div className="relative">
        {additionalCount > 0 && (
          <>
            <div
              className="absolute rounded-md bg-muted/40"
              style={{
                width: cardDims.width - 20,
                height: cardDims.height - 20,
                top: 12,
                left: 12,
              }}
            />
            <div
              className="absolute rounded-md bg-muted/60"
              style={{
                width: cardDims.width - 20,
                height: cardDims.height - 20,
                top: 6,
                left: 6,
              }}
            />
          </>
        )}

        <div
          className={cn('rounded-md bg-muted overflow-hidden', arClass)}
          style={{
            width: cardDims.width,
            opacity: 0.85,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          }}
        >
          {element.thumbnail_url ? (
            <img
              src={element.thumbnail_url}
              alt=""
              className={cn('h-full w-full', fitClass)}
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted" />
          )}
        </div>

        {additionalCount > 0 && (
          <div className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            +{additionalCount}
          </div>
        )}
      </div>
    );
  }

  if (type === 'group' && group) {
    const dims = GROUP_CARD_SIZES[size];

    return (
      <div
        className="relative rounded-lg border border-border bg-card overflow-hidden"
        style={{
          width: dims.width,
          height: dims.height,
          opacity: 0.85,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}
      >
        <div className="flex h-full w-full items-center justify-center bg-muted/50">
          <Folder className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-card/90 px-2.5 py-1.5">
          <span className="text-[13px] font-medium text-foreground truncate block">
            {group.name}
          </span>
        </div>
      </div>
    );
  }

  return null;
}
