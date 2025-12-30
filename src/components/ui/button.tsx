import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const variants = {
  primary: cn(
    'bg-green-600 text-white',
    'hover:-translate-y-0.5 hover:bg-green-500',
    'hover:shadow-lg hover:shadow-green-500/25',
    'active:translate-y-0 active:scale-[0.98]',
    'focus-visible:ring-green-500'
  ),
  secondary: cn(
    'border border-slate-300 bg-white text-slate-700',
    'hover:bg-slate-50 hover:border-slate-400',
    'active:scale-[0.98]',
    'focus-visible:ring-slate-500'
  ),
  ghost: cn(
    'text-slate-600 bg-transparent',
    'hover:bg-slate-100 hover:text-slate-900',
    'active:bg-slate-200'
  ),
  danger: cn(
    'bg-red-600 text-white',
    'hover:-translate-y-0.5 hover:bg-red-500',
    'hover:shadow-lg hover:shadow-red-500/25',
    'active:translate-y-0 active:scale-[0.98]',
    'focus-visible:ring-red-500'
  ),
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading = false, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'relative inline-flex items-center justify-center gap-2',
          'rounded-lg font-medium',
          'transition-all duration-fast ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'disabled:hover:translate-y-0 disabled:hover:shadow-none',
          variants[variant],
          sizes[size],
          loading && 'text-transparent',
          className
        )}
        {...props}
      >
        {children}
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-current" />
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
