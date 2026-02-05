import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  showDot?: boolean;
  pulse?: boolean;
  icon?: React.ReactNode;
  onRemove?: () => void;
}

export const Badge = ({
  className,
  variant = 'default',
  size = 'md',
  showDot = false,
  pulse = false,
  icon,
  onRemove,
  children,
  ...props
}: BadgeProps) => {
  const variants = {
    default: 'border-warm-300 text-warm-600 bg-warm-50/50',
    primary: 'border-primary-300 text-primary-700 bg-primary-50/50',
    secondary: 'border-warm-200 text-warm-500 bg-warm-50/50',
    success: 'border-primary-300 text-primary-700 bg-primary-50/50',
    warning: 'border-amber-300 text-amber-700 bg-amber-50/50',
    danger: 'border-red-300 text-red-700 bg-red-50/50',
    info: 'border-blue-300 text-blue-700 bg-blue-50/50',
    outline: 'border-warm-300 text-warm-600 bg-transparent',
  };

  const dotColors = {
    default: 'bg-warm-500',
    primary: 'bg-primary-500',
    secondary: 'bg-warm-400',
    success: 'bg-primary-500',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
    info: 'bg-blue-500',
    outline: 'bg-warm-500',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-0.5 text-xs',
    lg: 'px-3 py-1 text-sm',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium border rounded-full',
        'transition-all duration-200',
        variants[variant],
        sizes[size],
        pulse && 'animate-badge-pulse',
        className
      )}
      {...props}
    >
      {showDot && (
        <span className={cn(
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          dotColors[variant],
          pulse && 'animate-pulse-subtle',
        )} />
      )}
      {icon && <span className="flex-shrink-0 -ml-0.5">{icon}</span>}
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove"
          className={cn(
            'flex-shrink-0 -mr-1 w-4 h-4 rounded-full',
            'inline-flex items-center justify-center',
            'hover:bg-black/10 transition-colors duration-150',
            'active:scale-90',
          )}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
};

// Count badge for notifications
interface CountBadgeProps {
  count: number;
  max?: number;
  variant?: 'primary' | 'danger' | 'warning';
  className?: string;
}

export function CountBadge({ count, max = 99, variant = 'danger', className }: CountBadgeProps) {
  if (count <= 0) return null;

  const displayCount = count > max ? `${max}+` : count.toString();

  const variantClasses = {
    primary: 'bg-primary-600 text-white',
    danger: 'bg-red-500 text-white',
    warning: 'bg-amber-500 text-white',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1',
        'text-[10px] font-bold rounded-full tabular-nums',
        'animate-scale-in',
        variantClasses[variant],
        className
      )}
    >
      {displayCount}
    </span>
  );
}
