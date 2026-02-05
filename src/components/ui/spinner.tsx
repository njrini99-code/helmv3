import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'white' | 'current';
  variant?: 'dots' | 'circular';
  label?: string;
}

export function Spinner({
  className,
  size = 'md',
  color = 'primary',
  variant = 'circular',
  label,
  ...props
}: SpinnerProps) {
  if (variant === 'dots') {
    return <DotsSpinner className={className} size={size} color={color} {...props} />;
  }

  const circularSizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  };

  const strokeWidths = {
    sm: 3,
    md: 3,
    lg: 2.5,
    xl: 2,
  };

  const colors = {
    primary: 'text-primary-600',
    white: 'text-white',
    current: 'text-current',
  };

  return (
    <div
      className={cn('inline-flex flex-col items-center justify-center gap-2', className)}
      role="status"
      aria-label={label || 'Loading'}
      {...props}
    >
      <svg
        className={cn('animate-spin', circularSizes[size], colors[color])}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-20"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth={strokeWidths[size]}
        />
        <path
          className="opacity-90"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {label && (
        <span className={cn('text-sm font-medium', colors[color])}>{label}</span>
      )}
    </div>
  );
}

// Dots variant (backward compatible)
function DotsSpinner({
  className,
  size = 'md',
  color = 'primary',
  ...props
}: Omit<SpinnerProps, 'variant' | 'label'>) {
  const dotSizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
    xl: 'w-3 h-3',
  };

  const colors = {
    primary: 'bg-primary-600',
    white: 'bg-white',
    current: 'bg-current',
  };

  const gaps = {
    sm: 'gap-0.5',
    md: 'gap-1',
    lg: 'gap-1.5',
    xl: 'gap-2',
  };

  return (
    <div
      className={cn('flex items-center justify-center', gaps[size], className)}
      role="status"
      aria-label="Loading"
      {...props}
    >
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className={cn('rounded-full animate-bounce', dotSizes[size], colors[color])}
          style={{ animationDelay: `${delay}ms`, animationDuration: '600ms' }}
        />
      ))}
    </div>
  );
}
