'use client';

import { cn } from '@/lib/utils';
import { formatStorage } from '@/lib/utils/format';
import { ChevronDown, ChevronRight, Check, Minus } from 'lucide-react';

type CheckboxState = 'empty' | 'partial' | 'full';

interface SectionHeaderProps {
  label: string;
  count: number;
  totalSize?: number;
  collapsed: boolean;
  checkboxState: CheckboxState;
  onToggleCollapse: () => void;
  onToggleSelectAll: () => void;
  className?: string;
}

/** Russian pluralization: 1 группа, 2 группы, 5 групп */
function pluralize(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count) % 100;
  const lastDigit = abs % 10;
  if (abs >= 11 && abs <= 19) return `${count} ${many}`;
  if (lastDigit === 1) return `${count} ${one}`;
  if (lastDigit >= 2 && lastDigit <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
}

const SECTION_LABELS: Record<string, [string, string, string]> = {
  'Группы': ['группа', 'группы', 'групп'],
  'Элементы': ['элемент', 'элемента', 'элементов'],
};

export function SectionHeader({
  label,
  count,
  totalSize,
  collapsed,
  checkboxState,
  onToggleCollapse,
  onToggleSelectAll,
  className,
}: SectionHeaderProps) {
  const ChevronIcon = collapsed ? ChevronRight : ChevronDown;
  const forms = SECTION_LABELS[label] ?? [label, label, label];
  const countLabel = pluralize(count, forms[0], forms[1], forms[2]);

  return (
    <div className={cn('flex items-center gap-2 py-1', className)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelectAll();
        }}
        className={cn(
          'flex h-[18px] w-[18px] items-center justify-center rounded-sm border-[1.5px] transition-colors',
          checkboxState === 'empty'
            ? 'border-[#475569] bg-transparent'
            : 'border-primary bg-primary',
        )}
        aria-label={`Выбрать все ${label.toLowerCase()}`}
      >
        {checkboxState === 'full' && <Check className="h-3 w-3 text-primary-foreground" />}
        {checkboxState === 'partial' && <Minus className="h-3 w-3 text-primary-foreground" />}
      </button>

      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex items-center gap-1.5 text-[12px] font-medium text-[#94A3B8] hover:text-foreground transition-colors"
      >
        <ChevronIcon className="h-4 w-4 text-[#64748B] transition-transform duration-200" />
        <span>{countLabel}</span>
      </button>

      {totalSize !== undefined && totalSize > 0 && (
        <>
          <span className="text-[12px] text-[#475569]">·</span>
          <span className="text-[12px] text-[#64748B]">{formatStorage(totalSize)}</span>
        </>
      )}
    </div>
  );
}
