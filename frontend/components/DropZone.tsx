'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  maxFiles?: number;
  maxSize?: number; // in bytes
}

const ACCEPTED_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg', '.jpe'],
  'image/png': ['.png'],
  'video/mp4': ['.mp4'],
};

export default function DropZone({
  onFilesSelected,
  disabled = false,
  maxFiles = 10,
  maxSize = 100 * 1024 * 1024, // 100MB default
}: DropZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFilesSelected(acceptedFiles);
      }
    },
    [onFilesSelected]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    disabled,
    maxFiles,
    maxSize,
    multiple: true,
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className={`
          relative rounded-xl border-2 border-dashed transition-all cursor-pointer
          p-8 text-center
          ${
            isDragActive
              ? 'border-accent bg-accent/5 scale-[1.02]'
              : disabled
              ? 'border-surface-border bg-surface-tertiary cursor-not-allowed opacity-50'
              : 'border-surface-border hover:border-accent/50 hover:bg-surface-secondary'
          }
        `}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center gap-4">
          {/* Upload icon */}
          <div className="w-16 h-16 rounded-2xl bg-surface-tertiary flex items-center justify-center">
            <svg
              className="w-8 h-8 text-txt-muted"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>

          {/* Text */}
          <div>
            <p className="text-sm font-medium text-txt-primary mb-1">
              {isDragActive ? 'Отпустите файлы для загрузки' : 'Перетащите файлы сюда'}
            </p>
            <p className="text-xs text-txt-muted">
              или нажмите для выбора файлов
            </p>
          </div>

          {/* File types */}
          <div className="text-xs text-txt-muted">
            <p>Поддерживаемые форматы: JPG, PNG, MP4</p>
            <p className="mt-1">
              Максимум {maxFiles} файлов • До {Math.round(maxSize / 1024 / 1024)} МБ каждый
            </p>
          </div>
        </div>
      </div>

      {/* Errors */}
      {fileRejections.length > 0 && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm font-medium text-red-800 mb-2">Некоторые файлы отклонены:</p>
          <ul className="text-xs text-red-600 space-y-1">
            {fileRejections.map(({ file, errors }) => (
              <li key={file.name}>
                <span className="font-medium">{file.name}</span>:{' '}
                {errors.map((e) => {
                  if (e.code === 'file-too-large') {
                    return `размер превышает ${Math.round(maxSize / 1024 / 1024)} МБ`;
                  }
                  if (e.code === 'file-invalid-type') {
                    return 'неподдерживаемый формат';
                  }
                  if (e.code === 'too-many-files') {
                    return `превышен лимит (максимум ${maxFiles} файлов)`;
                  }
                  return e.message;
                }).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
