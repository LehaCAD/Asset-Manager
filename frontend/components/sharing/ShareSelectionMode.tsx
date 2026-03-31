'use client'

interface ShareSelectionModeProps {
  selectedIds: Set<number>
  totalCount: number
  onConfirm: () => void
  onCancel: () => void
  onSelectAll: () => void
}

export function ShareSelectionMode({
  selectedIds,
  totalCount,
  onConfirm,
  onCancel,
  onSelectAll,
}: ShareSelectionModeProps) {
  const count = selectedIds.size
  const allSelected = count === totalCount && totalCount > 0

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border shadow-lg">
      <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center gap-4">
        <span className="text-sm text-muted-foreground flex-shrink-0">
          {count === 0
            ? 'Ничего не выбрано'
            : `Выбрано: ${count} ${pluralElements(count)}`}
        </span>

        <button
          type="button"
          onClick={onSelectAll}
          className="text-sm text-primary hover:underline flex-shrink-0"
        >
          {allSelected ? 'Снять выделение' : 'Выбрать все'}
        </button>

        <div className="flex-1" />

        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
        >
          Отмена
        </button>

        <button
          type="button"
          onClick={onConfirm}
          disabled={count === 0}
          className="text-sm px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Создать ссылку
        </button>
      </div>
    </div>
  )
}

function pluralElements(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'элемент'
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'элемента'
  return 'элементов'
}
