'use client';

import { Component, Suspense, useCallback, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { SkeletonStat } from '@/components/fairway';
import { PanelStale } from './PanelStates';

/**
 * Per-panel resilience: one upstream hiccup (Sentry 429, RPC timeout) must
 * never blank the console — the monitor must be more reliable than the
 * monitored. Suspense shows a layout-matching skeleton; the error boundary
 * degrades to an amber card scoped to THIS panel only, with a real retry
 * (router.refresh() re-runs the server render; the boundary resets so the
 * refreshed children get a clean mount).
 */

function PanelRetryButton({ onReset }: { onReset: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const retry = useCallback(() => {
    startTransition(() => {
      router.refresh();
      onReset();
    });
  }, [router, onReset]);

  return (
    <button
      type="button"
      onClick={retry}
      disabled={isPending}
      className="mt-1 rounded-lg border border-fw-warning/40 px-3 py-1 text-xs font-medium text-warm-700 transition-colors hover:bg-fw-warning/10 disabled:opacity-50"
    >
      {isPending ? 'Retrying…' : 'Try again'}
    </button>
  );
}

class PanelErrorBoundary extends Component<
  { title: string; onRetryReset?: () => void; children: ReactNode },
  { error: Error | null }
> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onRetryReset?.();
  };

  override render() {
    if (this.state.error) {
      return (
        <section aria-label={this.props.title}>
          <h2 className="mb-2 border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
            {this.props.title}
          </h2>
          {/* The h2 above already carries the panel title (and the <section>
              aria-label repeats it for a11y) — the label stays generic
              so it doesn't duplicate "title" text into an ambiguous second
              text-matching node next to the heading. */}
          <PanelStale
            label="This panel"
            error={this.state.error.message}
            action={<PanelRetryButton onReset={this.reset} />}
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
  // Remounting the boundary subtree on retry gives the refreshed RSC payload
  // a clean mount instead of re-rendering a poisoned tree.
  const [attempt, setAttempt] = useState(0);
  return (
    <PanelErrorBoundary
      key={attempt}
      title={title}
      onRetryReset={() => setAttempt((n) => n + 1)}
    >
      <Suspense fallback={skeleton ?? <SkeletonStat />}>{children}</Suspense>
    </PanelErrorBoundary>
  );
}
