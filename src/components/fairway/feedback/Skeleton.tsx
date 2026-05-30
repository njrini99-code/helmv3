'use client';

/**
 * ============================================================================
 * Fairway · feedback · Skeleton (DESIGN-SYSTEM.md §6 "Skeleton", §7.3)
 * ----------------------------------------------------------------------------
 * Shape-matched shimmer blocks that RESERVE the final layout — never spinners
 * (the system bans `animate-spin` on primary data, §7.3). Skeletons reduce CLS
 * by holding the slot the real content will occupy.
 *
 * Tokens only: warm `bg-surface-sunken` blocks with a cream specular sweep. The
 * sweep is built from the existing `animate-shimmer` keyframe + `bg-shimmer`
 * gradient already in tailwind.config.ts (no injected <style>, no dangerouslySet
 * InnerHTML). The sweep is suppressed under `prefers-reduced-motion` via the
 * `motion-reduce:animate-none` variant — the block then rests as a calm matte
 * placeholder.
 *
 * Composition:
 *   <Skeleton className="h-4 w-32" />                 // single block
 *   <SkeletonText lines={3} />                        // paragraph
 *   <SkeletonCard />                                  // a matte Card shell
 *   <SkeletonStat />                                  // a MetricCard shell
 *   <SkeletonList rows={5} />                         // list / table rows
 *
 * Every skeleton group carries `role="status"` + `aria-busy` + an SR-only label
 * so assistive tech announces "loading" without reading the empty boxes.
 * ========================================================================== */

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Render as a perfect circle (avatars, status dots). */
  circle?: boolean;
}

/**
 * The atomic skeleton block. Size it with utilities (`h-4 w-32`, `h-40 w-full`).
 * Defaults to a rounded matte block; pass `circle` for avatars. The cream sweep
 * rides over the warm sunken fill and stops under reduced motion.
 */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { className, circle = false, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(
        'relative isolate overflow-hidden bg-surface-sunken',
        // cream specular sweep, reused from the existing tailwind keyframe/gradient
        'before:absolute before:inset-0 before:bg-shimmer before:bg-[length:200%_100%]',
        'before:animate-shimmer before:content-[""]',
        'motion-reduce:before:hidden motion-reduce:before:animate-none',
        circle ? 'rounded-full' : 'rounded-fw-sm',
        className,
      )}
      {...props}
    />
  );
});

/** Wraps a skeleton group with the loading a11y contract. */
function SkeletonGroup({
  label = 'Loading',
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}

export interface SkeletonTextProps {
  /** Number of lines to render. */
  lines?: number;
  /** Shorten the final line for a natural paragraph rag. */
  lastLineWidth?: string;
  className?: string;
  label?: string;
}

/** A shape-matched paragraph — multiple body lines with a short last line. */
export function SkeletonText({
  lines = 3,
  lastLineWidth = '60%',
  className,
  label,
}: SkeletonTextProps) {
  const count = Math.max(1, lines);
  return (
    <SkeletonGroup label={label} className={cn('space-y-2.5', className)}>
      {Array.from({ length: count }).map((_, i) => {
        const isLast = i === count - 1 && count > 1;
        return (
          <Skeleton
            key={i}
            className="h-3.5"
            style={{ width: isLast ? lastLineWidth : '100%' }}
          />
        );
      })}
    </SkeletonGroup>
  );
}

/** A matte Card-shaped skeleton (avatar + title + body lines + optional media). */
export function SkeletonCard({
  className,
  lines = 3,
  withMedia = false,
  label,
}: {
  className?: string;
  lines?: number;
  withMedia?: boolean;
  label?: string;
}) {
  return (
    <SkeletonGroup
      label={label}
      className={cn('rounded-card border border-border-subtle bg-surface p-6', className)}
    >
      {withMedia && <Skeleton className="mb-5 h-40 w-full rounded-fw-md" />}
      <div className="flex items-center gap-3">
        <Skeleton circle className="h-9 w-9" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      <div className="mt-5">
        <SkeletonText lines={lines} label={label} />
      </div>
    </SkeletonGroup>
  );
}

/** A MetricCard-shaped skeleton — big value block, label, quiet sparkline slot. */
export function SkeletonStat({ className, label }: { className?: string; label?: string }) {
  return (
    <SkeletonGroup
      label={label}
      className={cn('rounded-card border border-border-subtle bg-surface p-6', className)}
    >
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-9 w-28" />
      <Skeleton className="mt-4 h-8 w-full rounded-fw-sm" />
    </SkeletonGroup>
  );
}

/** A list / table of evenly-spaced rows (roster, leaderboard, dense lists). */
export function SkeletonList({
  rows = 5,
  className,
  label,
}: {
  rows?: number;
  className?: string;
  label?: string;
}) {
  return (
    <SkeletonGroup label={label} className={cn('space-y-2', className)}>
      {Array.from({ length: Math.max(1, rows) }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-fw-md bg-surface-sunken px-4 py-3"
        >
          <Skeleton circle className="h-8 w-8" />
          <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${70 - (i % 3) * 8}%` }} />
          <Skeleton className="h-3.5 w-12" />
        </div>
      ))}
    </SkeletonGroup>
  );
}
