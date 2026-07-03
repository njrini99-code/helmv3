'use client';

import { Component, Suspense, type ReactNode } from 'react';
import { SkeletonStat } from '@/components/fairway';
import { PanelStale } from './PanelStates';

/**
 * Per-panel resilience: one upstream hiccup (Sentry 429, RPC timeout) must
 * never blank the console — the monitor must be more reliable than the
 * monitored. Suspense shows a layout-matching skeleton; the error boundary
 * degrades to an amber STALE card scoped to THIS panel only.
 */

class PanelErrorBoundary extends Component<
  { title: string; children: ReactNode },
  { error: Error | null }
> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <section aria-label={this.props.title}>
          <h2 className="mb-2 border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
            {this.props.title}
          </h2>
          {/* The h2 above already carries the panel title (and the <section>
              aria-label repeats it for a11y) — the STALE label stays generic
              so it doesn't duplicate "title" text into an ambiguous second
              text-matching node next to the heading. */}
          <PanelStale
            label="This panel is temporarily unavailable"
            error={this.state.error.message}
          />
        </section>
      );
    }
    return this.props.children;
  }
}

export function PanelBoundary({
  title,
  skeleton,
  children,
}: {
  title: string;
  skeleton?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PanelErrorBoundary title={title}>
      <Suspense fallback={skeleton ?? <SkeletonStat />}>{children}</Suspense>
    </PanelErrorBoundary>
  );
}
