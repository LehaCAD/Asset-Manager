'use client';

import { useState } from 'react';
import Image from 'next/image';
import { type Asset } from '@/lib/api';
import ConfirmDialog from './ui/ConfirmDialog';

interface AssetThumbnailProps {
  asset: Asset;
  index: number;
  isSelected: boolean;
  isHeadliner: boolean;
  onSelect: () => void;
  onSetHeadliner: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  dragHandleProps?: Record<string, unknown>;
  aspectClass?: string;
}

export default function AssetThumbnail({
  asset,
  index,
  isSelected,
  isHeadliner,
  onSelect,
  onSetHeadliner,
  onToggleFavorite,
  onDelete,
  dragHandleProps,
  aspectClass = 'aspect-square',
}: AssetThumbnailProps) {
  const [showDelete, setShowDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const isVideo = asset.asset_type === 'VIDEO';
  const thumbnailUrl = asset.thumbnail_url || asset.file_url;
  const isVerticalFormat = aspectClass === 'aspect-vertical';

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await onDelete();
      setShowDelete(false);
    } catch {
      // Error already handled in parent
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <div
        onClick={onSelect}
        className={`group relative ${aspectClass} rounded-lg overflow-hidden cursor-pointer transition-all border-2 ${
          isSelected
            ? 'border-accent shadow-lg'
            : 'border-transparent hover:border-accent/30'
        }`}
      >
        {/* Thumbnail */}
        <div className="relative w-full h-full bg-surface-tertiary">
          <Image
            src={thumbnailUrl}
            alt={`Элемент #${index + 1}`}
            fill
            sizes="150px"
            className="object-cover rounded-lg"
          />

          {/* Type indicator - bottom left */}
          <div className="absolute bottom-1.5 left-1.5 bg-black/60 backdrop-blur-sm w-5 h-5 rounded flex items-center justify-center">
            {isVideo ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            )}
          </div>

          {/* Order badge */}
          <div className="absolute top-1.5 left-1.5 bg-black/70 backdrop-blur-sm w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white">
            {index + 1}
          </div>

          {/* Drag handle */}
          {dragHandleProps && (
            <div
              {...dragHandleProps}
              className="absolute top-1.5 left-7 bg-black/70 backdrop-blur-sm w-5 h-5 rounded flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-white"
              >
                <circle cx="9" cy="5" r="1.5" />
                <circle cx="15" cy="5" r="1.5" />
                <circle cx="9" cy="12" r="1.5" />
                <circle cx="15" cy="12" r="1.5" />
                <circle cx="9" cy="19" r="1.5" />
                <circle cx="15" cy="19" r="1.5" />
              </svg>
            </div>
          )}

          {/* Icon toggle buttons - top right */}
          <div className={`absolute top-1.5 right-1.5 ${isVerticalFormat ? 'flex-col' : 'flex-row'} flex gap-1 z-10`}>
            {/* Heart - headliner toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSetHeadliner();
              }}
              className={`bg-black/60 backdrop-blur-sm w-5 h-5 rounded flex items-center justify-center transition-opacity ${
                isHeadliner ? 'opacity-100' : 'opacity-40 hover:opacity-70'
              }`}
              title={isHeadliner ? 'Лучший элемент' : 'Сделать лучшим'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill={isHeadliner ? '#ef4444' : 'white'} stroke="none">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>

            {/* Star - favorite toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
              className={`bg-black/60 backdrop-blur-sm w-5 h-5 rounded flex items-center justify-center transition-opacity ${
                asset.is_favorite ? 'opacity-100' : 'opacity-40 hover:opacity-70'
              }`}
              title={asset.is_favorite ? 'Убрать из избранного' : 'В избранное'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill={asset.is_favorite ? '#facc15' : 'white'} stroke="none">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
            </button>
          </div>

          {/* Delete button - bottom right, visible on hover */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDelete(true);
            }}
            className="absolute bottom-1.5 right-1.5 bg-black/60 backdrop-blur-sm w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-500/80"
            title="Удалить элемент"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Удалить элемент?"
        message="Этот элемент будет удалён безвозвратно."
        confirmText="Удалить"
        danger
        loading={deleteLoading}
      />
    </>
  );
}
