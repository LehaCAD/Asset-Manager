'use client';

export interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
}

interface UploadProgressProps {
  uploads: UploadItem[];
}

export default function UploadProgress({ uploads }: UploadProgressProps) {
  if (uploads.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 w-96 max-h-[400px] bg-white rounded-xl shadow-2xl border border-surface-border overflow-hidden z-50">
      {/* Header */}
      <div className="px-4 py-3 bg-surface-secondary border-b border-surface-border">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-txt-primary">
            Загрузка файлов
          </h3>
          <span className="text-xs text-txt-muted">
            {uploads.filter((u) => u.status === 'completed').length} / {uploads.length}
          </span>
        </div>
      </div>

      {/* Upload items */}
      <div className="max-h-[320px] overflow-y-auto">
        {uploads.map((upload) => (
          <div
            key={upload.id}
            className="px-4 py-3 border-b border-surface-border last:border-b-0"
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-surface-tertiary flex items-center justify-center">
                {upload.status === 'completed' ? (
                  <svg
                    className="w-5 h-5 text-green-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : upload.status === 'error' ? (
                  <svg
                    className="w-5 h-5 text-red-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 text-accent animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-txt-primary truncate">
                  {upload.file.name}
                </p>
                <p className="text-xs text-txt-muted mt-0.5">
                  {formatFileSize(upload.file.size)}
                </p>

                {/* Progress bar */}
                {upload.status === 'uploading' && (
                  <div className="mt-2">
                    <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all duration-300"
                        style={{ width: `${upload.progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-txt-muted mt-1">{upload.progress}%</p>
                  </div>
                )}

                {/* Error */}
                {upload.status === 'error' && upload.error && (
                  <p className="text-xs text-red-600 mt-1">{upload.error}</p>
                )}

                {/* Completed */}
                {upload.status === 'completed' && (
                  <p className="text-xs text-green-600 mt-1">Загружено</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
