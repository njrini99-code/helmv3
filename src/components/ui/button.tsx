'use client';

import { ButtonHTMLAttributes, forwardRef, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'success';
  size?: 'sm' | 'md' | 'lg' | 'icon-sm' | 'icon';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** Haptic intensity on tap (native only). Defaults to 'light'. Pass 'none' to disable. */
  haptic?: 'none' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';
  children: React.ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading = false, disabled, leftIcon, rightIcon, haptic, children, onClick, ...props }, ref) => {
    const rippleRef = useRef<HTMLSpanElement>(null);

    const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
      // Native haptic feedback — light impact by default, or variant-based default.
      const hapticStyle = haptic ?? (
        variant === 'danger' ? 'warning' :
        variant === 'success' ? 'success' :
        'light'
      );
      if (hapticStyle !== 'none') {
        // Fire and forget — triggerHaptic no-ops on web
        void triggerHaptic(hapticStyle);
      }

      // Ripple effect
      const button = e.currentTarget;
      const ripple = document.createElement('span');
      const rect = button.getBoundingClientRect();
      const diameter = Math.max(rect.width, rect.height);
      const radius = diameter / 2;

      ripple.style.width = ripple.style.height = `${diameter}px`;
      ripple.style.left = `${e.clientX - rect.left - radius}px`;
      ripple.style.top = `${e.clientY - rect.top - radius}px`;
      ripple.className = 'absolute rounded-full pointer-events-none animate-ripple bg-current opacity-[0.12]';

      button.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);

      onClick?.(e);
    }, [onClick, haptic, variant]);

    const baseStyles = cn(
      'relative overflow-hidden inline-flex items-center justify-center gap-2 font-medium rounded-[10px]',
      'whitespace-nowrap', // Prevent label text from wrapping ("Add First Class" -> single line)
      'transition-all duration-200 ease-out',
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
      'active:scale-[0.97] active:duration-75',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
    );

    const variants = {
      primary: 'bg-primary-600 text-white shadow-sm hover:bg-primary-700 hover:shadow-md hover:-translate-y-0.5 active:shadow-sm active:translate-y-0',
      secondary: 'bg-white text-warm-700 border border-warm-200 hover:bg-warm-50 hover:border-warm-300 hover:shadow-sm',
      ghost: 'text-warm-600 hover:bg-warm-100 hover:text-warm-900',
      danger: 'text-red-600 border border-red-200 bg-red-50/50 hover:bg-red-50 hover:border-red-300 hover:text-red-700',
      outline: 'bg-transparent text-warm-700 border border-warm-200 hover:bg-warm-50 hover:border-warm-300 hover:shadow-sm',
      success: 'bg-primary-600 text-white shadow-sm hover:bg-primary-700 hover:shadow-md hover:-translate-y-0.5',
    };

    const sizes = {
      sm: 'px-3 py-2.5 text-xs min-h-[44px]',
      md: 'px-5 py-2.5 text-sm min-h-[44px]',
      lg: 'px-6 py-3 text-base min-h-[48px]',
      'icon-sm': 'h-11 w-11 p-0',
      icon: 'h-12 w-12 p-0',
    };

    // iOS-native loading pattern: keep the original label visible, prepend an
    // inline spinner, and block pointer events. We do NOT replace the label
    // with a "Loading..." placeholder — that causes layout shift and loses
    // context for the user.
    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          isLoading && 'pointer-events-none cursor-wait',
          className,
        )}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        onClick={handleClick}
        {...props}
      >
        <span ref={rippleRef} />
        {isLoading ? (
          <svg
            className="animate-spin h-4 w-4 flex-shrink-0 -ml-0.5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          leftIcon && <span className="flex-shrink-0 -ml-0.5">{leftIcon}</span>
        )}
        {children}
        {!isLoading && rightIcon && <span className="flex-shrink-0 -mr-0.5">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };

// Icon Button Component
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  tooltip?: string;
}

// NOTE: Always pass aria-label when using IconButton for accessibility (icon-only buttons need text labels for screen readers)
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  // NOTE: Always pass aria-label when using IconButton for accessibility (icon-only buttons need text labels for screen readers)
  ({ className, variant = 'default', size = 'md', tooltip, children, ...props }, ref) => {
    const ariaLabel = props['aria-label'] || tooltip;
    const baseStyles = cn(
      'relative overflow-hidden inline-flex items-center justify-center rounded-[10px]',
      'transition-all duration-200 ease-out',
      'active:scale-[0.93] active:duration-75',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2',
      'disabled:opacity-50 disabled:cursor-not-allowed',
    );

    const variants = {
      default: 'text-warm-500 hover:bg-warm-100 hover:text-warm-900',
      primary: 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm hover:shadow-md',
      ghost: 'text-warm-400 hover:text-warm-600 hover:bg-warm-50',
    };

    const sizes = {
      // a11y W3D: tap target must be >= 44px. Keep the visual icon size (the
      // children glyph is unchanged) and enlarge the hit area via min-size +
      // padding instead of the old fixed 36px (w-9 h-9) box.
      sm: 'min-h-[44px] min-w-[44px] p-2.5',
      md: 'w-11 h-11',
      lg: 'w-12 h-12',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        aria-label={ariaLabel} title={tooltip} {...props}
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
