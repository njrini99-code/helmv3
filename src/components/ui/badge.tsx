import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
  showDot?: boolean;
}

export const Badge = ({ className, variant = 'default', showDot = false, children, ...props }: BadgeProps) => {
  const variants = {
    default: 'border-warm-300 text-warm-600',
    primary: 'border-primary-300 text-primary-700 bg-primary-50/50',
    secondary: 'border-warm-200 text-warm-500 bg-warm-50/50',
    success: 'border-primary-300 text-primary-700 bg-primary-50/50',
    warning: 'border-amber-300 text-amber-700 bg-amber-50/50',
    danger: 'border-red-300 text-red-700 bg-red-50/50',
    info: 'border-blue-300 text-blue-700 bg-blue-50/50',
    outline: 'border-warm-300 text-warm-600 bg-transparent',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium border rounded-full',
        variants[variant],
        className
      )}
      {...props}
    >
      {showDot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
};
