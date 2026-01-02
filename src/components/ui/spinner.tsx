import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'white' | 'current';
}

export function Spinner({ className, size = 'md', color = 'primary', ...props }: SpinnerProps) {
  const sizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
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
  };

  return (
    <div className={cn('flex items-center justify-center', gaps[size], className)} {...props}>
      <span
        className={cn('rounded-full animate-bounce', sizes[size], colors[color])}
        style={{ animationDelay: '0ms', animationDuration: '600ms' }}
      />
      <span
        className={cn('rounded-full animate-bounce', sizes[size], colors[color])}
        style={{ animationDelay: '150ms', animationDuration: '600ms' }}
      />
      <span
        className={cn('rounded-full animate-bounce', sizes[size], colors[color])}
        style={{ animationDelay: '300ms', animationDuration: '600ms' }}
      />
    </div>
  );
}
