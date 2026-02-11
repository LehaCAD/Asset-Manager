'use client';

import { useState, useRef, useEffect } from 'react';

interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface DropdownMenuProps {
  items: MenuItem[];
  size?: 'normal' | 'small';
}

export default function DropdownMenu({ items, size = 'normal' }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const isSmall = size === 'small';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setIsOpen(!isOpen);
        }}
        className={`${isSmall ? 'p-1' : 'p-1.5'} rounded-lg text-txt-muted hover:text-txt-primary hover:bg-white/80 backdrop-blur-sm transition-colors`}
        aria-label="Меню"
      >
        <svg width={isSmall ? "16" : "20"} height={isSmall ? "16" : "20"} viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {isOpen && (
        <div className={`absolute right-0 top-full mt-1 ${isSmall ? 'w-40' : 'w-48'} bg-white rounded-xl border border-surface-border shadow-lg z-50 animate-slide-down overflow-hidden`}>
          {items.map((item, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (!item.disabled && item.onClick) {
                  setIsOpen(false);
                  item.onClick();
                }
              }}
              disabled={item.disabled}
              className={`
                w-full flex items-center gap-3 ${isSmall ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'} text-left transition-colors
                ${item.disabled
                  ? 'text-txt-muted/50 cursor-not-allowed'
                  : item.danger
                    ? 'text-red-500 hover:bg-red-50'
                    : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-hover'
                }
              `}
            >
              {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
