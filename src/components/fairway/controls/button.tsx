'use client';

/**
 * ============================================================================
 * Fairway · Button + IconButton
 * ----------------------------------------------------------------------------
 * The warm-premium Fairway button. A clean rebuild of the reference
 * src/components/ui/button.tsx onto the locked Fairway tokens — no ripple/haptic
 * coupling, no raw hex, pill CTAs, slow tactile motion, a green focus ring that
 * survives black + cream.
 *
 * Variants: primary | secondary | ghost | danger
 * Sizes:    sm | md | lg  (+ IconButton: sm | md | lg, always >=44px touch)
 * States:   default · hover (tint + shadow-soft + 1px lift) · focus-visible
 *           (green ring) · active (translate-y-[0.5px]) · disabled (opacity-50)
 *           · busy (inline spinner, label stays, aria-busy)
 *
 * Composability: `asChild` renders the styling onto a child element (e.g. a
 * Next <Link>) via @radix-ui/react-slot. forwardRef for both.
 *
 * CHILDREN CONTRACT (non-asChild): `children` is wrapped in a single bare
 * <span>. Passing multiple sibling elements intending a flex-row layout gets
 * silently split across lines by CSS anonymous-box rules the moment one child
 * is itself display:flex — with no lint or type error. Pass ONE child; if you
 * need a multi-element row, pre-compose it in your own flex-row span first
 * (see FeatureDotGrid's FeatureChip for the pattern).
 * ========================================================================== */

import { type ButtonHTMLAttributes, type MouseEvent, type ReactNode, forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';
import { fwHaptic } from '@/lib/fairway/haptics';
import { fwDisabled, fwFocusRing, fwTransition } from './_internal';

export type FwButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type FwButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: FwButtonVariant;
  size?: FwButtonSize;
  /** Busy state: shows an inline spinner, keeps the label, sets aria-busy and blocks clicks. */
  busy?: boolean;
  /** Make the button stretch to its container width. */
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /** Render styling onto the child element (e.g. a Link) instead of a <button>. */
  asChild?: boolean;
  children: ReactNode;
}

const base = cn(
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap',
  'rounded-full font-fw-sans font-medium text-text-primary',
  'border', // border slot — variants set its color (or make it transparent)
  fwTransition,
  fwFocusRing,
  fwDisabled,
  // Tactile press: settle 0.5px down AND a hair of scale, spring-timed ONLY on
  // :active (the soft overshoot reads as a physical key-press; hover keeps the
  // calm base curve). Collapsed under reduced motion.
  'active:translate-y-[0.5px] active:scale-[0.98] active:[transition-timing-function:var(--fw-ease-spring)]',
  'motion-reduce:active:translate-y-0 motion-reduce:active:scale-100',
);

const variantStyles: Record<FwButtonVariant, string> = {
  // Green CTA — the plant in the room. Cream text on green, no border.
  //
  // Fill is accent-700. This REPLACES an earlier "keep accent-500, do not
  // re-darken for WCAG" decision, reversed by the owner on 2026-07-24 once the
  // numbers were re-checked — the old rationale was wrong on the facts:
  //   • text-on-accent on accent-500 measures 3.06:1; normal text needs 4.5:1.
  //   • WCAG large text is >=24px, or >=18.66px BOLD. A 14-15px bold control
  //     label is NOT large text, so 1.4.3's 3:1 allowance never applied.
  //   • 1.4.11 (3:1 non-text) governs the button's BOUNDARY, not the label
  //     sitting on top of it.
  //   • accent-600 does not rescue it either (4.23:1).
  // accent-700 gives 5.93:1 and clears AA. accent-500 stays the brand green for
  // decorative fills, strokes and dots.
  primary: cn(
    'border-transparent bg-accent-700 text-text-on-accent shadow-flat',
    'hover:bg-accent-800 hover:shadow-soft hover:-translate-y-px',
    'active:bg-accent-800 active:shadow-flat active:-translate-y-0',
  ),
  // Matte surface with a warm hairline (border OR shadow at rest — border here).
  secondary: cn(
    'border-border-subtle bg-surface text-text-primary shadow-flat',
    'hover:bg-surface-tint hover:border-border-strong hover:shadow-soft',
    'active:shadow-flat',
  ),
  // Chrome-light: no fill at rest, warm tint wash on hover.
  ghost: cn(
    'border-transparent bg-transparent text-text-secondary',
    'hover:bg-surface-sunken hover:text-text-primary',
    'active:bg-surface-sunken',
  ),
  // Destructive — canonical danger, tinted-soft at rest, fills on hover.
  danger: cn(
    'border-transparent bg-fw-danger-bg text-fw-danger-ink',
    'hover:bg-fw-danger hover:text-text-on-accent hover:shadow-soft',
    'active:shadow-flat',
  ),
};

const sizeStyles: Record<FwButtonSize, string> = {
  // `sm` is dense (36px) on fine pointers (mouse/trackpad), but expands to the
  // WCAG 2.2 / DoD-required >=44px touch target on coarse pointers (touch). This
  // keeps the compact triage/toolbar density on desktop while every primary
  // action stays tappable on mobile without a layout rewrite.
  sm: 'min-h-[36px] [@media(pointer:coarse)]:min-h-[44px] px-3.5 py-1.5 text-[13px] leading-4',
  md: 'min-h-[44px] px-5 py-2.5 text-[15px] leading-6',
  lg: 'min-h-[48px] px-6 py-3 text-[15px] leading-6',
};

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-4 w-4 flex-shrink-0 animate-spin motion-reduce:animate-none', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-80"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    busy = false,
    fullWidth = false,
    leftIcon,
    rightIcon,
    asChild = false,
    disabled,
    children,
    onClick,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button';

  // Light tactile tap on the real <button> press (fire-and-forget, safe no-op on
  // web). Skipped under asChild — that path forwards onClick straight to the
  // child element/Slot and must not be wrapped.
  const handleClick = asChild
    ? onClick
    : (event: MouseEvent<HTMLButtonElement>) => {
        fwHaptic('light');
        onClick?.(event);
      };

  // When rendering asChild, the consumer owns the inner element; we cannot inject
  // multiple icon spans into an arbitrary single child, so we pass through children
  // as-is and only apply styling/state attributes.
  const content = asChild ? (
    (children as ReactNode)
  ) : (
    <>
      {busy ? <Spinner /> : leftIcon ? <span className="flex-shrink-0">{leftIcon}</span> : null}
      <span>{children}</span>
      {!busy && rightIcon ? <span className="flex-shrink-0">{rightIcon}</span> : null}
    </>
  );

  return (
    <Comp
      ref={ref}
      className={cn(
        base,
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        busy && 'cursor-wait',
        className,
      )}
      // `asChild` forwards these to the child element; for a non-button child the
      // consumer should ensure semantics (e.g. role) are correct.
      {...(asChild ? {} : { disabled: disabled || busy, type: props.type ?? 'button' })}
      aria-busy={busy || undefined}
      data-slot="fw-button"
      data-variant={variant}
      onClick={handleClick}
      {...props}
    >
      {content}
    </Comp>
  );
});

export { Button };

/* ────────────────────────────────────────────────────────────────────────── */

export type FwIconButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type FwIconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: FwIconButtonVariant;
  size?: FwIconButtonSize;
  busy?: boolean;
  /** Required for a11y — icon-only controls need an accessible name. */
  'aria-label': string;
  children: ReactNode;
}

const iconBase = cn(
  'relative inline-flex select-none items-center justify-center rounded-full border',
  'text-text-secondary',
  fwTransition,
  fwFocusRing,
  fwDisabled,
  'active:translate-y-[0.5px] motion-reduce:active:translate-y-0',
);

const iconVariantStyles: Record<FwIconButtonVariant, string> = {
  // Matches Button primary — accent-700.
  //
  // The icon-only case genuinely DID clear its bar (a glyph is a UI component
  // judged at 3:1 by 1.4.11, and 3.06:1 passes). It moves anyway: a primary
  // IconButton sitting beside a primary Button in a different green reads as a
  // rendering bug, and "matches Button primary" is the contract this variant
  // exists to hold. See the Button primary note above for the full reasoning.
  primary: cn(
    'border-transparent bg-accent-700 text-text-on-accent',
    'hover:bg-accent-800 hover:shadow-soft',
  ),
  secondary: cn(
    'border-border-subtle bg-surface text-text-primary',
    'hover:bg-surface-tint hover:border-border-strong',
  ),
  ghost: cn(
    'border-transparent bg-transparent',
    'hover:bg-surface-sunken hover:text-text-primary',
  ),
  danger: cn(
    'border-transparent bg-transparent text-fw-danger-ink',
    'hover:bg-fw-danger-bg',
  ),
};

// All sizes clear the WCAG 2.2 >=24px minimum; on coarse pointers `sm` expands
// to the DoD-preferred >=44px touch target (md/lg already exceed it).
const iconSizeStyles: Record<FwIconButtonSize, string> = {
  sm: 'h-9 w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 [&_svg]:h-4 [&_svg]:w-4',
  md: 'h-11 w-11 [&_svg]:h-5 [&_svg]:w-5',
  lg: 'h-12 w-12 [&_svg]:h-5 [&_svg]:w-5',
};

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, variant = 'ghost', size = 'md', busy = false, disabled, children, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(iconBase, iconVariantStyles[variant], iconSizeStyles[size], busy && 'cursor-wait', className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      data-slot="fw-icon-button"
      {...props}
    >
      {busy ? <Spinner /> : children}
    </button>
  );
});

export { IconButton };
