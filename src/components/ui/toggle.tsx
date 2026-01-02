'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface ToggleProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
}

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  ({ className, checked = false, onCheckedChange, label, ...props }, ref) => {
    return (
      <div className="flex items-center gap-3">
        <button
          ref={ref}
          role="switch"
          aria-checked={checked}
          type="button"
          onClick={() => onCheckedChange?.(!checked)}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer',
            'rounded-full border-2 border-transparent',
            'transition-colors duration-200 ease-in-out',
            'focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            checked ? 'bg-primary-600' : 'bg-warm-200',
            className
          )}
          {...props}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-5 w-5',
              'rounded-full bg-white shadow-lg ring-0',
              checked ? 'translate-x-5' : 'translate-x-0'
            )}
            style={{ 
              transition: 'transform 200ms cubic-bezier(0.68, -0.55, 0.265, 1.55)' 
            }}
          />
        </button>
        {label && (
          <span className="text-sm text-warm-700">{label}</span>
        )}
      </div>
    );
  }
);

Toggle.displayName = 'Toggle';
