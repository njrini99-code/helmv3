'use client';

import { cn } from '@/lib/utils';

interface SectionSkeletonProps {
  /** Approximate visual height of the loading body. Defaults to a chart-ish 220px. */
  height?: number;
  /** Optional label for screen readers; the visual stays a generic shimmer. */
  label?: string;
  className?: string;
}

/**
 * Lightweight skeleton used as the `<Suspense fallback>` for the lazily-loaded
 * Overview deep-dive bodies (User Funnel, Daily Trends, Platform Health).
 *
 * Each accordion swaps this in while its chunk downloads / mounts, so the page
 * stays interactive and individual sections reveal progressively instead of
 * blocking on the heaviest one (DailyCharts pulls Recharts ~100KB gz).
 */
export function SectionSkeleton({
  height = 220,
  label = 'Loading section',
  className,
}: SectionSkeletonProps) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className={cn('w-full animate-pulse space-y-3', className)}
    >
      <div className="flex items-center justify-between">
        <div className="h-4 w-32 rounded bg-warm-200" />
        <div className="h-4 w-20 rounded bg-warm-200" />
      </div>
      <div
        className="w-full rounded-xl bg-warm-100"
        style={{ height: `${height}px` }}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
