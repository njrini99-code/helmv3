'use client';

import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ className, label, id, ...props }, ref) => {
    const generatedId = useId();
    const radioId = id || generatedId;

    return (
      <label className="flex items-center gap-3 cursor-pointer group">
        <div className="relative">
          <input
            ref={ref}
            type="radio"
            id={radioId}
            className="peer sr-only"
            {...props}
          />
          <div className={cn(
            'w-5 h-5 border-2 border-warm-300 rounded-full bg-white',
            'transition-all duration-200',
            'peer-checked:border-primary-600',
            'peer-focus:ring-2 peer-focus:ring-primary-600/20',
            'peer-disabled:opacity-50 peer-disabled:cursor-not-allowed',
            className
          )}>
            <div 
              className="absolute inset-1 rounded-full bg-primary-600 scale-0 opacity-0 transition-all duration-200 peer-checked:scale-100 peer-checked:opacity-100"
              style={{ transitionTimingFunction: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)' }}
            />
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

Radio.displayName = 'Radio';
