'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface ToggleProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeConfig = {
  sm: {
    track: 'h-5 w-9',
    thumb: 'h-4 w-4',
    translate: 'translate-x-4',
    label: 'text-sm',
  },
  md: {
    track: 'h-6 w-11',
    thumb: 'h-5 w-5',
    translate: 'translate-x-5',
    label: 'text-sm',
  },
  lg: {
    track: 'h-7 w-[52px]',
    thumb: 'h-6 w-6',
    translate: 'translate-x-[26px]',
    label: 'text-base',
  },
};

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  ({ className, checked = false, onCheckedChange, label, description, size = 'md', ...props }, ref) => {
    const config = sizeConfig[size];

    return (
      <div className="flex items-start gap-3">
        <button
          ref={ref}
          role="switch"
          aria-checked={checked}
          type="button"
          onClick={() => onCheckedChange?.(!checked)}
          className={cn(
            'relative inline-flex shrink-0 cursor-pointer',
            'rounded-full border-2 border-transparent',
            'transition-colors duration-200 ease-in-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40 focus-visible:ring-offset-2',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'active:scale-95',
            checked ? 'bg-primary-600' : 'bg-warm-200',
            config.track,
            className
          )}
          {...props}
        >
          <span
            className={cn(
              'pointer-events-none inline-block rounded-full bg-white shadow-md ring-0',
              checked ? config.translate : 'translate-x-0',
              config.thumb,
            )}
            style={{
              transition: 'transform 200ms cubic-bezier(0.68, -0.55, 0.265, 1.55)',
            }}
          >
            {/* Subtle icon indicators */}
            {checked ? (
              <svg className="w-full h-full p-0.5 text-primary-600" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M6 10l2 2 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg className="w-full h-full p-1 text-warm-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 10h8" strokeLinecap="round" />
              </svg>
            )}
          </span>
        </button>
        {(label || description) && (
          <div className="flex-1 min-w-0">
            {label && (
              <span className={cn(
                'text-warm-700 font-medium select-none block',
                config.label,
              )}>
                {label}
              </span>
            )}
            {description && (
              <span className="text-xs text-warm-500 select-none block mt-0.5">
                {description}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }
);

Toggle.displayName = 'Toggle';
