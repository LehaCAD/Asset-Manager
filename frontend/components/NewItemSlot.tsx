'use client';

interface NewItemSlotProps {
  label: string;
  onClick: () => void;
  aspectClass?: string;
}

export default function NewItemSlot({ label, onClick, aspectClass = 'aspect-video' }: NewItemSlotProps) {
  return (
    <button
      onClick={onClick}
      className={`group relative ${aspectClass} rounded-xl border-2 border-dashed border-surface-border hover:border-accent/50 bg-surface-secondary hover:bg-surface-tertiary transition-all duration-200 overflow-hidden cursor-pointer animate-fade-in-up`}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <div className="text-3xl text-txt-muted/40 group-hover:text-accent/60 transition-colors">
          +
        </div>
        <span className="text-xs text-txt-muted/60 group-hover:text-txt-secondary transition-colors font-medium">
          {label}
        </span>
      </div>
    </button>
  );
}
