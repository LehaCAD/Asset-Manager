import { cn } from '@/lib/utils'

export function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

export function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all',
        active
          ? 'bg-primary text-primary-foreground'
          : 'border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
      )}
    >
      {label}
      <span className={cn('tabular-nums', active ? 'text-primary-foreground/70' : 'text-muted-foreground/60')}>
        {count}
      </span>
    </button>
  )
}
