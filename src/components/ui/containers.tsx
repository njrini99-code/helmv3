import { cn } from '@/lib/utils';
import { HTMLAttributes } from 'react';

// W1 (2026-05-28) — canonical page-width containers. Replaces the prior
// scatter of `max-w-(3xl|4xl|5xl|6xl|7xl)` page wrappers across
// src/app/golf + src/app/baseball with two purpose-named primitives.
// See docs/operations/2026-05-28-ultra-audit-MASTER-synthesis.md §5
// (design-system unification).

interface ContainerGridProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Allow the grid to stretch wider on very large viewports. Use for
   * data-dense, multi-column dashboards (roster, team stats,
   * intelligence, analytics) that benefit from the extra width.
   */
  wide?: boolean;
}

/**
 * ContainerGrid — the default page wrapper for card grids, KPI rows, and
 * multi-section dashboards. Centered, full-width with responsive gutters,
 * capped at 1280px (or 1536px when `wide`).
 */
export function ContainerGrid({
  wide = false,
  className,
  children,
  ...props
}: ContainerGridProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 md:px-6 lg:px-8 max-w-[1280px]',
        wide && '2xl:max-w-[1536px]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * ContainerReading — the page wrapper for settings, forms, and reading
 * feeds. Narrower measure (720px) keeps line lengths comfortable.
 */
export function ContainerReading({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mx-auto w-full max-w-[720px] px-4 md:px-6', className)}
      {...props}
    >
      {children}
    </div>
  );
}
