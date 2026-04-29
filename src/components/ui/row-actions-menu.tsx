'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';
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
    // Escape to close
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const handleToggle = useCallback(() => {
    void triggerHaptic('light');
    setOpen((v) => !v);
  }, []);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={handleToggle}
        className="
          w-11 h-11 rounded-xl
          flex items-center justify-center
          text-warm-400 hover:text-warm-700 hover:bg-warm-100/60
          active:bg-warm-200/60 active:scale-95
          transition-[color,background-color,transform] duration-150
          focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40
        "
        aria-label="Row actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>

      {open && (
        <div
          role="menu"
          className="
            absolute right-0 top-full mt-1.5 z-20
            min-w-[180px]
            bg-cream-50/95 backdrop-blur-xl
            border border-warm-200/50
            rounded-2xl
            shadow-[0_12px_40px_rgba(16,24,40,0.14)]
            py-1.5
            origin-top-right
            animate-in fade-in zoom-in-95 slide-in-from-top-1
            duration-180
          "
        >
          {actions.map((action, index) => (
            <button
              key={index}
              role="menuitem"
              onClick={() => {
                if (action.disabled) return;
                void triggerHaptic('light');
                action.onClick();
                setOpen(false);
              }}
              disabled={action.disabled}
              className={cn(
                "w-full flex items-center gap-3",
                "px-3 py-2.5 min-h-[44px]",
                "text-[15px] font-medium text-left",
                "transition-colors duration-100",
                action.variant === 'danger'
                  ? "text-[#FF3B30] hover:bg-[#FF3B30]/8 active:bg-[#FF3B30]/12"
                  : "text-warm-800 hover:bg-warm-100/60 active:bg-warm-100/80",
                action.disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              {action.icon && (
                <action.icon
                  className={cn(
                    "w-[18px] h-[18px] flex-shrink-0",
                    action.variant === 'danger' ? "text-[#FF3B30]" : "text-warm-500",
                  )}
                />
              )}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
