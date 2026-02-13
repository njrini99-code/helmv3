'use client';

import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RowAction } from '@/lib/types/table';

interface RowActionsMenuProps {
  actions: RowAction[];
}

export function RowActionsMenu({ actions }: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="
          w-11 h-11 rounded-[8px]
          flex items-center justify-center
          text-warm-400 hover:text-warm-600 hover:bg-warm-100
          transition-all duration-200
        "
        aria-label="Row actions"
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>

      {open && (
        <div className="
          absolute right-0 top-full mt-1 z-20
          min-w-[160px]
          bg-white
          border border-warm-200
          rounded-[12px]
          shadow-lg
          py-1
          animate-in fade-in slide-in-from-top-2
          duration-150
        ">
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={() => {
                action.onClick();
                setOpen(false);
              }}
              disabled={action.disabled}
              className={cn(
                "w-full flex items-center gap-2.5",
                "px-3 py-2.5 min-h-[44px]",
                "text-sm text-left",
                "transition-colors duration-150",
                action.variant === 'danger'
                  ? "text-red-600 hover:bg-red-50"
                  : "text-warm-700 hover:bg-warm-50",
                action.disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              {action.icon && <action.icon className="w-4 h-4" />}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
