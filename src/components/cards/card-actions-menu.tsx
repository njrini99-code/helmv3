'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

// ============================================
// TYPES
// ============================================

export interface CardAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

interface CardActionsMenuProps {
  open: boolean;
  onClose: () => void;
  actions: CardAction[];
  className?: string;
}

// ============================================
// COMPONENT
// ============================================

export function CardActionsMenu({
  open,
  onClose,
  actions,
  className,
}: CardActionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onClose]);

  // Close on escape
  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Menu */}
      <div
        ref={menuRef}
        className={cn(
          'absolute right-3 bottom-full mb-2 z-50',
          'w-56',
          'bg-white rounded-xl',
          'border border-warm-200',
          'shadow-xl',
          'overflow-hidden',
          'animate-fade-in',
          className
        )}
      >
        <div className="py-2">
          {actions.map((action, index) => {
            const Icon = action.icon;

            return (
              <button
                key={index}
                onClick={() => {
                  if (!action.disabled) {
                    action.onClick();
                    onClose();
                  }
                }}
                disabled={action.disabled}
                className={cn(
                  'w-full flex items-center gap-3',
                  'px-4 py-2.5',
                  'text-sm transition-colors',
                  action.disabled
                    ? 'text-warm-300 cursor-not-allowed'
                    : action.variant === 'danger'
                    ? 'text-red-600 hover:bg-red-50 active:bg-red-100'
                    : 'text-warm-700 hover:bg-warm-50 active:bg-warm-100'
                )}
              >
                {Icon && (
                  <Icon
                    className={cn(
                      'w-4 h-4',
                      action.disabled
                        ? 'text-warm-300'
                        : action.variant === 'danger'
                        ? 'text-red-500'
                        : 'text-warm-400'
                    )}
                  />
                )}
                <span className="flex-1 text-left">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
