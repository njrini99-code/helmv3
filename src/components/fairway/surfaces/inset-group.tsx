'use client';

/**
 * ============================================================================
 * Fairway · surfaces · InsetGroup — one recessed group, hairline seams
 * ----------------------------------------------------------------------------
 * The cure for card soup. Several related rows (a venue, a description, who is
 * invited; a setting and its neighbours; a player's facts) become ONE object:
 * a single recessed block with internal hairlines. Never a stack of rounded
 * rectangles.
 *
 *   <InsetGroup>
 *     <InsetGroup.Row icon={<MapPin />} trailing={<ArrowUpRight />}>University Ballroom</InsetGroup.Row>
 *     <InsetGroup.Row icon={<AlignLeft />}>Annual awards dinner…</InsetGroup.Row>
 *   </InsetGroup>
 *
 * Material: depth-0/1 — a sunken well (`bg-surface-sunken`, no border) on a
 * matte plane, or `variant="matte"` (hairline + surface) when the group sits
 * on the sunken canvas itself. Radius is step 2 (`rounded-fw-md`): a nested
 * group, never a card. Row icons are bare accent glyphs (owner decision,
 * 2026-09-09), never tinted discs.
 * ========================================================================== */

import { forwardRef, type ElementType, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { fwFocusRing, fwTransition } from '../controls/_internal';

export type InsetGroupVariant = 'inset' | 'matte';

export interface InsetGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** `inset` (default): sunken well on a matte plane. `matte`: hairline + surface. */
  variant?: InsetGroupVariant;
  /** Accessible label for the group when it stands alone. */
  'aria-label'?: string;
  children: ReactNode;
}

const GROUP_VARIANT: Record<InsetGroupVariant, string> = {
  inset: 'bg-surface-sunken',
  matte: 'border border-border-subtle bg-surface',
};

const InsetGroupRoot = forwardRef<HTMLDivElement, InsetGroupProps>(function InsetGroup(
  { variant = 'inset', className, children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      data-slot="inset-group"
      data-variant={variant}
      className={cn(
        'overflow-hidden rounded-fw-md text-text-primary',
        GROUP_VARIANT[variant],
        // the seams: one hairline between rows, half a pixel on retina
        '[&>*+*]:border-t [&>*+*]:border-border-subtle [@media(min-resolution:2dppx)]:[&>*+*]:border-t-[0.5px]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});

export interface InsetGroupRowProps extends HTMLAttributes<HTMLElement> {
  /** Leading glyph (rendered bare, in the accent ink). */
  icon?: ReactNode;
  /** Trailing affordance: an arrow, a value, a chevron. */
  trailing?: ReactNode;
  /** Render as a link/button when the row is an action. */
  as?: ElementType;
  href?: string;
  /** Vertically align the icon with the first line for multi-line rows. */
  align?: 'center' | 'start';
  children: ReactNode;
}

const InsetGroupRow = forwardRef<HTMLElement, InsetGroupRowProps>(function InsetGroupRow(
  { icon, trailing, as, align = 'center', className, children, ...props },
  ref,
) {
  const Comp = (as ?? 'div') as ElementType;
  const interactive = Boolean(as && as !== 'div');
  return (
    <Comp
      ref={ref}
      data-slot="inset-group-row"
      className={cn(
        'flex w-full min-h-11 gap-3 px-4 py-2.5 text-left font-fw-sans text-body-sm leading-5',
        align === 'center' ? 'items-center' : 'items-start',
        interactive && [
          'cursor-pointer',
          fwTransition,
          fwFocusRing,
          '[@media(hover:hover)]:hover:bg-surface-tint active:bg-surface-tint',
        ],
        className,
      )}
      {...props}
    >
      {icon ? (
        <span
          aria-hidden
          className={cn(
            'inline-flex h-5 w-5 shrink-0 items-center justify-center text-accent-700 [&_svg]:h-[18px] [&_svg]:w-[18px]',
            align === 'start' && 'mt-px',
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">{children}</span>
      {trailing ? (
        <span className="ml-auto inline-flex shrink-0 items-center text-text-tertiary [&_svg]:h-4 [&_svg]:w-4">
          {trailing}
        </span>
      ) : null}
    </Comp>
  );
});

export const InsetGroup = Object.assign(InsetGroupRoot, { Row: InsetGroupRow });
export { InsetGroupRow };
