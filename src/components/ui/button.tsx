import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon-sm' | 'icon';
  isLoading?: boolean;
  children: React.ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading = false, disabled, children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center gap-2 font-medium rounded-[10px] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 active:scale-[0.98]';

    const variants = {
      primary: 'bg-primary-600 text-white shadow-sm hover:bg-primary-700 hover:shadow-md hover:-translate-y-0.5 active:shadow-sm',
      secondary: 'bg-white text-warm-700 border border-warm-200 hover:bg-warm-50 hover:border-warm-300',
      ghost: 'text-warm-600 hover:bg-warm-100 hover:text-warm-900',
      danger: 'text-red-600 border border-red-300 bg-transparent hover:bg-red-50 hover:border-red-400',
      outline: 'bg-transparent text-warm-700 border border-warm-200 hover:bg-warm-50 hover:border-warm-300',
    };

    const sizes = {
      sm: 'px-3 py-2.5 text-xs min-h-[44px]',
      md: 'px-5 py-2.5 text-sm min-h-[44px]',
      lg: 'px-6 py-3 text-base min-h-[48px]',
      'icon-sm': 'h-11 w-11 p-0',
      icon: 'h-12 w-12 p-0',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <div className="flex items-center justify-center gap-1">
            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };

// Icon Button Component
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'default' | 'primary';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center w-11 h-11 rounded-[10px] transition-all duration-200 active:scale-[0.95]';

    const variants = {
      default: 'text-warm-600 hover:bg-warm-100 hover:text-warm-900',
      primary: 'bg-primary-600 text-white hover:bg-primary-700',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';

// Button Group Component (Pill Container)
export interface ButtonGroupProps {
  children: React.ReactNode;
  className?: string;
}

export const ButtonGroup = ({ children, className }: ButtonGroupProps) => {
  return (
    <div className={cn('inline-flex bg-warm-100 p-1 rounded-full', className)}>
      {children}
    </div>
  );
};

// Button Group Option
export interface ButtonGroupOptionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: React.ReactNode;
}

export const ButtonGroupOption = forwardRef<HTMLButtonElement, ButtonGroupOptionProps>(
  ({ className, active = false, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'px-4 py-2.5 text-sm font-medium rounded-full transition-all duration-200 min-h-[44px]',
          active
            ? 'bg-white text-warm-900 shadow-sm'
            : 'text-warm-600 hover:text-warm-900',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

ButtonGroupOption.displayName = 'ButtonGroupOption';
