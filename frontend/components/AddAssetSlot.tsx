'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

interface AddAssetSlotProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  aspectClass?: string;
}

const ACCEPTED_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg', '.jpe'],
  'image/png': ['.png'],
  'video/mp4': ['.mp4'],
};

export default function AddAssetSlot({
  onFilesSelected,
  disabled = false,
  aspectClass = 'aspect-square',
}: AddAssetSlotProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFilesSelected(acceptedFiles);
      }
    },
    [onFilesSelected]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    disabled,
    multiple: true,
  });

  return (
    <div
      {...getRootProps()}
      className={`
        ${aspectClass} w-full rounded-xl border-2 border-dashed transition-all cursor-pointer
        flex flex-col items-center justify-center gap-2
        ${
          isDragActive
            ? 'border-accent bg-accent/10 scale-[1.02]'
            : disabled
            ? 'border-surface-border bg-surface-tertiary cursor-not-allowed opacity-50'
            : 'border-surface-border bg-surface-secondary hover:border-accent/50 hover:bg-surface-hover'
        }
      `}
    >
      <input {...getInputProps()} />
      
      {/* Plus icon */}
      <div className="text-4xl text-txt-muted">+</div>
      
      {/* Label */}
      <p className="text-xs text-txt-muted text-center px-2">
        {isDragActive ? 'Отпустите файлы' : 'Перетащить\nили выбрать'}
      </p>
    </div>
  );
}
