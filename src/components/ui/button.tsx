'use client';

import { ButtonHTMLAttributes, forwardRef, useCallback } from 'react';
import { Slot } from '@radix-ui/react-slot';
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
  /**
   * Render the button's styling onto a single child element instead of emitting a
   * `<button>` — the correct shape for a link that looks like a button:
   *
   *     <Button asChild><Link href="/x">Go</Link></Button>   // ONE <a>
   *
   * The wrapping form `<Link><Button/></Link>` puts a control inside a control:
   * two focusable elements for one action, an ambiguous click target, and a
   * screen reader announcing a button nested in a link. It renders, so it is easy
   * to ship — `src/test/dom-nesting/no-nested-interactive.test.ts` is what catches
   * it. This prop is the fix, and it exists here (not only on the Fairway button)
   * because every wrapping site in the repo imports THIS Button.
   *
   * Constraints, mirroring `src/components/fairway/controls/button.tsx`:
   *   - exactly one child element (Radix `Slot` requirement)
   *   - `leftIcon` / `rightIcon` / the `isLoading` spinner are NOT injected — we
   *     cannot add sibling spans to an arbitrary single child. Compose them
   *     inside the child yourself.
   *   - `disabled` is not forwarded (invalid on `<a>`); it becomes
   *     `aria-disabled` plus `pointer-events-none`, so a disabled link-button is
   *     neither clickable nor silently still-active.
   */
  asChild?: boolean;
  children: React.ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading = false, disabled, leftIcon, rightIcon, haptic, asChild = false, children, onClick, ...props }, ref) => {
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

    const Comp = asChild ? Slot : 'button';
    const isDisabled = disabled || isLoading;

    // iOS-native loading pattern: keep the original label visible, prepend an
    // inline spinner, and block pointer events. We do NOT replace the label
    // with a "Loading..." placeholder — that causes layout shift and loses
    // context for the user.
    return (
      <Comp
        ref={ref}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          isLoading && 'pointer-events-none cursor-wait',
          // `disabled` cannot be forwarded to a non-button child, so under
          // asChild the disabled state has to be expressed in CSS + ARIA or it
          // would render as a normal, clickable link.
          asChild && isDisabled && 'pointer-events-none opacity-50',
          className,
        )}
        {...(asChild
          ? { 'aria-disabled': isDisabled || undefined }
          : { disabled: isDisabled })}
        aria-busy={isLoading || undefined}
        // Ripple + haptic stay ON under asChild, unlike the Fairway button which
        // skips them. The reason is behaviour preservation, not inconsistency for
        // its own sake: every asChild call site here is a former
        // `<Link><Button/></Link>`, where the Button was the styled element and
        // did ripple. Since this component applies `relative overflow-hidden` to
        // whichever element it styles, the ripple host is still correct — so
        // keeping it means the migration is invisible to the user.
        onClick={handleClick}
        {...props}
      >
        {/*
          No ripple-host span here. handleClick appends the ripple element to
          the BUTTON itself, so the empty <span ref={rippleRef} /> that used to
          sit here was never written to — but it WAS a flex item, so the
          button's `gap-2` inserted 8px between it and the label and pushed
          every label 4px right of centre. Visible in the footer, where
          "Request Demo" stopped lining up with the links above it (audit L-12).
        */}
        {asChild ? (
          // Slot takes exactly ONE child and clones it — icon spans and the
          // spinner cannot be injected as siblings. Compose them inside the
          // child instead.
          children
        ) : (
          <>
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
          </>
        )}
      </Comp>
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
