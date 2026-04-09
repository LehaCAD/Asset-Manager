'use client'

interface SystemMessageProps {
  text: string
  createdAt: string
}

export function SystemMessage({ text, createdAt }: SystemMessageProps) {
  return (
    <div>
      <div className="flex items-center gap-3 py-2 px-4">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[10px] text-muted-foreground bg-muted/50 rounded-full px-3 py-0.5 whitespace-nowrap">
          {text.replace(/^⚡\s*/, '')}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>
      <p className="text-center text-[10px] text-muted-foreground/60 -mt-1 mb-1">
        {new Date(createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  )
}
