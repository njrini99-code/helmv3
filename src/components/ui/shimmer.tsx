/**
 * Shimmer — typed wrapper around the global `.skeleton-shimmer` CSS sweep.
 *
 * The shimmer effect itself (the diagonal highlight that sweeps every 2s)
 * is owned by `.skeleton-shimmer` in globals.css. This component exists so
 * call sites can write structural skeletons declaratively without copy-
 * pasting the bg + skeleton-shimmer + rounded combo on every block.
 *
 * Use `<Shimmer/>` for the placeholder rectangles inside a loading layout.
 * For decorative pulses (status dots, refresh spinners) keep `animate-pulse`
 * — the shimmer cadence is for inert content placeholders only.
 *
 *   <Shimmer className="h-7 w-48" />              // text line / chip
 *   <Shimmer variant="circle" className="w-12" /> // avatar / icon
 *   <Shimmer variant="line" className="w-32" />   // text line, half-height
 *
 * Inside a card, wrap the card body in `<ShimmerCard>` to get the
 * surface-matte glass + the moving sweep across the whole tile.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

type ShimmerVariant = 'block' | 'circle' | 'line';

interface ShimmerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** block (default rect), circle (1:1), line (half-height inline). */
  variant?: ShimmerVariant;
  /** Stagger this shimmer behind sibling shimmers in a row. Each step adds 80ms. */
  staggerIndex?: number;
}

export function Shimmer({
  variant = 'block',
  staggerIndex = 0,
  className,
  style,
  ...props
}: ShimmerProps) {
  const delay = Math.max(0, staggerIndex) * 80;
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn(
        'skeleton-shimmer bg-warm-200/55',
        variant === 'block' && 'h-4 rounded-md',
        variant === 'line' && 'h-3 rounded-full',
        variant === 'circle' && 'aspect-square rounded-full',
        className,
      )}
      style={{ animationDelay: `${delay}ms`, ...style }}
      {...props}
    />
  );
}

interface ShimmerCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Stagger this card behind sibling cards in a row. Each step adds 80ms. */
  staggerIndex?: number;
}

/**
 * Surface-matte glass card with the shimmer sweep already laid in. Drop
 * `<Shimmer/>` blocks inside as the structural placeholders for whatever
 * the card normally renders (title, value, sparkline, etc).
 *
 * Sits on the canonical California-modern matte recipe (linen→cream
 * gradient + warm two-layer natural-light shadow) so the loading state
 * shares its surface vocabulary with the populated state. The shimmer
 * sweep rides on top.
 */
export function ShimmerCard({ staggerIndex = 0, className, style, children, ...props }: ShimmerCardProps) {
  const delay = Math.max(0, staggerIndex) * 80;
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn(
        'surface-matte relative overflow-clip rounded-2xl p-5',
        className,
      )}
      style={{ animationDelay: `${delay}ms`, ...style }}
      {...props}
    >
      <div className="skeleton-shimmer pointer-events-none absolute inset-0" />
      <div className="relative">{children}</div>
    </div>
  );
}
