'use client';

import { forwardRef, useId, useState } from 'react';
import { cn } from '@/lib/utils';

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, description, id, indeterminate = false, checked, onChange, ...props }, ref) => {
    const generatedId = useId();
    const checkboxId = id || generatedId;
    const [isPressed, setIsPressed] = useState(false);

    const isChecked = checked || false;

    return (
      <label
        className="flex items-start gap-3 cursor-pointer group min-h-[44px] py-2"
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onMouseLeave={() => setIsPressed(false)}
      >
        <div className="relative flex-shrink-0 mt-0.5">
          <input
            ref={(el) => {
              if (el) {
                el.indeterminate = indeterminate;
              }
              if (typeof ref === 'function') ref(el);
              else if (ref) ref.current = el;
            }}
            type="checkbox"
            id={checkboxId}
            checked={checked}
            onChange={onChange}
            className="peer sr-only"
            {...props}
          />
          {/* Ripple ring on press */}
          <div className={cn(
            'absolute -inset-2 rounded-full transition-all duration-200',
            isPressed ? 'bg-primary-600/10 scale-100' : 'bg-transparent scale-75 opacity-0'
          )} />
          {/* Checkbox visual */}
          <div className={cn(
            'relative w-6 h-6 border-2 rounded-md bg-white',
            'transition-all duration-200',
            isChecked || indeterminate
              ? 'border-primary-600 bg-primary-600 shadow-sm'
              : 'border-warm-300 group-hover:border-warm-400',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-primary-600/20 peer-focus-visible:ring-offset-2',
            'peer-disabled:opacity-50 peer-disabled:cursor-not-allowed',
            className
          )}>
            {/* Checkmark SVG with animation */}
            {isChecked && !indeterminate && (
              <svg
                className="w-full h-full text-white p-0.5"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              >
                <path
                  d="M4 10l4 4 8-8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="animate-checkmark"
                  style={{
                    strokeDasharray: 24,
                    strokeDashoffset: 0,
                  }}
                />
              </svg>
            )}
            {/* Indeterminate dash */}
            {indeterminate && (
              <svg
                className="w-full h-full text-white p-0.5"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              >
                <path
                  d="M5 10h10"
                  strokeLinecap="round"
                  className="animate-scale-in"
                />
              </svg>
            )}
          </div>
        </div>
        {(label || description) && (
          <div className="flex-1 min-w-0">
            {label && (
              <span className="text-sm text-warm-700 select-none group-hover:text-warm-900 transition-colors block">
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
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
