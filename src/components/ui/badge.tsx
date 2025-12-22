import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
}

export function Badge({ className, variant = 'default', size = 'md', dot, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'badge',
        variant === 'default' && 'bg-cream-200 text-slate-700',
        variant === 'primary' && 'badge-primary',
        variant === 'secondary' && 'badge-secondary',
        variant === 'success' && 'badge-success',
        variant === 'warning' && 'badge-warning',
        variant === 'error' && 'badge-error',
        variant === 'info' && 'bg-blue-50 text-blue-700 border border-blue-200',
        size === 'sm' && 'px-2 py-0.5 text-2xs',
        size === 'lg' && 'px-3 py-1.5 text-sm',
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full mr-1',
            variant === 'default' && 'bg-slate-500',
            variant === 'primary' && 'bg-brand-600',
            variant === 'secondary' && 'bg-slate-500',
            variant === 'success' && 'bg-green-600',
            variant === 'warning' && 'bg-amber-600',
            variant === 'error' && 'bg-red-600',
            variant === 'info' && 'bg-blue-600'
          )}
        />
      )}
      {children}
    </span>
  );
}
