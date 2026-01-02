'use client';

import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => {
    const generatedId = useId();
    const checkboxId = id || generatedId;

    return (
      <label className="flex items-center gap-3 cursor-pointer group">
        <div className="relative">
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            className="peer sr-only"
            {...props}
          />
          <div className={cn(
            'w-5 h-5 border-2 border-warm-300 rounded-md bg-white',
            'transition-all duration-200',
            'peer-checked:border-primary-600 peer-checked:bg-primary-600',
            'peer-focus:ring-2 peer-focus:ring-primary-600/20',
            'peer-disabled:opacity-50 peer-disabled:cursor-not-allowed',
            className
          )}>
            <svg 
              className="w-full h-full text-white opacity-0 scale-50 transition-all duration-200 peer-checked:opacity-100 peer-checked:scale-100"
              style={{ transitionTimingFunction: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)' }}
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            >
              <path d="M4 10l3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        {label && (
          <span className="text-sm text-warm-700 select-none group-hover:text-warm-900 transition-colors">
            {label}
          </span>
        )}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
