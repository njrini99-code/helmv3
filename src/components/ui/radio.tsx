'use client';

import { forwardRef, useId, useState } from 'react';
import { cn } from '@/lib/utils';

interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ className, label, description, id, checked, ...props }, ref) => {
    const generatedId = useId();
    const radioId = id || generatedId;
    const [isPressed, setIsPressed] = useState(false);

    return (
      <label
        className="flex items-start gap-3 cursor-pointer group min-h-[44px] py-2"
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onMouseLeave={() => setIsPressed(false)}
      >
        <div className="relative flex-shrink-0 mt-0.5">
          <input
            ref={ref}
            type="radio"
            id={radioId}
            checked={checked}
            className="peer sr-only"
            {...props}
          />
          {/* Ripple ring on press */}
          <div className={cn(
            'absolute -inset-2 rounded-full transition-all duration-200',
            isPressed ? 'bg-primary-600/10 scale-100' : 'bg-transparent scale-75 opacity-0'
          )} />
          {/* Radio visual */}
          <div className={cn(
            'relative w-6 h-6 border-2 rounded-full bg-white',
            'transition-all duration-200',
            checked
              ? 'border-primary-600'
              : 'border-warm-300 group-hover:border-warm-400',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-primary-600/20 peer-focus-visible:ring-offset-2',
            'peer-disabled:opacity-50 peer-disabled:cursor-not-allowed',
            className
          )}>
            {/* Inner dot with bounce animation */}
            <div
              className={cn(
                'absolute inset-1.5 rounded-full bg-primary-600',
                'transition-all duration-200',
                checked
                  ? 'scale-100 opacity-100'
                  : 'scale-0 opacity-0'
              )}
              style={{
                transitionTimingFunction: checked
                  ? 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
                  : 'ease-out',
              }}
            />
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

Radio.displayName = 'Radio';

// Radio Group component for convenience
interface RadioGroupProps {
  name: string;
  value?: string;
  onChange?: (value: string) => void;
  options: { value: string; label: string; description?: string; disabled?: boolean }[];
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export function RadioGroup({
  name,
  value,
  onChange,
  options,
  orientation = 'vertical',
  className,
}: RadioGroupProps) {
  return (
    <div
      role="radiogroup"
      className={cn(
        'flex',
        orientation === 'vertical' ? 'flex-col gap-1' : 'flex-row flex-wrap gap-4',
        className
      )}
    >
      {options.map((option) => (
        <Radio
          key={option.value}
          name={name}
          value={option.value}
          checked={value === option.value}
          onChange={() => onChange?.(option.value)}
          label={option.label}
          description={option.description}
          disabled={option.disabled}
        />
      ))}
    </div>
  );
}
