'use client';

import { Component, Suspense, useCallback, useState, useTransition, type ReactNode, type ErrorInfo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { SkeletonStat } from '@/components/fairway';
import { Button } from '@/components/ui/button';
import { logError } from '@/lib/error-logging';
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
    <Button
      variant="outline"
      size="sm"
      type="button"
      onClick={retry}
      disabled={isPending}
      className="mt-1 rounded-lg border-fw-warning/40 px-3 py-1 text-xs font-medium text-warm-700 hover:bg-fw-warning/10"
    >
      {isPending ? 'Retrying…' : 'Try again'}
    </Button>
  );
}

class PanelErrorBoundary extends Component<
  { title: string; route: string; onRetryReset?: () => void; children: ReactNode },
  { error: Error | null }
> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  /**
   * `getDerivedStateFromError` above only produces the fallback UI — it never
   * reports. `componentDidCatch` is the commit-phase hook that does, and it
   * only fires client-side (SSR has no commit phase, so this never runs on
   * the server; no `typeof window` guard needed).
   *
   * Reuses the existing client error-reporting pipeline (`logError` from
   * `@/lib/error-logging`, POSTing through `/api/log-error`) rather than a
   * new one — the same pipeline `RouteErrorBoundary`/`CompactRouteErrorBoundary`
   * already call from their `useEffect`s (src/components/errors/RouteErrorBoundary.tsx).
   * That route classifies + persists to `error_logs` and `admin_events`
   * (`source: 'client'`, which the Errors page treats as `origin: 'app'`) with
   * a resolved `feature`, which is exactly the structured attribution this
   * boundary was missing — `classifyTraceSurface` only recognizes `/golf` and
   * `/baseball` routes, so an unmarked `/admin` panel error would classify to
   * `feature: null` same as today. Passing `feature: 'admin_dashboard'`
   * explicitly (the registry key whose actions include
   * `src/app/admin/actions/triage.ts`) fixes that.
   *
   * On double-reporting to Sentry: `logError` also calls
   * `Sentry.captureException` directly, and React's default `onCaughtError`
   * already turns this same caught error into a `console.error` that Sentry's
   * `captureConsoleIntegration` independently captures — so this call does
   * produce a second Sentry issue for one panel failure. That duplication is
   * not new or panel-specific: every existing class/effect-based boundary in
   * this codebase that calls `logError` (RouteErrorBoundary,
   * CompactRouteErrorBoundary, ~140 route `error.tsx` files) has the exact
   * same characteristic, since React's console.error-on-caught-error behavior
   * is a root-level option we don't control from an individual boundary.
   * There is no lower-level "persist to error_logs without touching Sentry"
   * export in error-logging.ts to call instead. Matching the established
   * pattern here (rather than inventing a dedup path just for panels) keeps
   * PanelBoundary consistent with how every other boundary in the app
   * reports, and the attribution gain (a filterable, feature-tagged,
   * app-origin row) is the actual goal — the extra Sentry row is a
   * pre-existing, accepted tradeoff of this pipeline, not one this change
   * introduces new.
   */
  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    try {
      logError(
        error,
        {
          component: `PanelBoundary:${this.props.title}`,
          panelTitle: this.props.title,
          route: this.props.route,
          boundary: 'panel',
          feature: 'admin_dashboard',
          sport: 'shared',
          componentStack: errorInfo.componentStack ?? undefined,
        },
        // 'medium', not 'high': this boundary exists precisely so one
        // panel's upstream hiccup degrades to a scoped, retryable card
        // instead of an incident — matching the severity
        // CompactRouteErrorBoundary already uses for the same class of
        // inline/embedded (non-full-page) error state.
        'medium',
      );
    } catch {
      // Reporting must never affect the fallback UI it exists to describe.
    }
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
  const pathname = usePathname();
  return (
    <PanelErrorBoundary
      key={attempt}
      title={title}
      route={pathname ?? ''}
      onRetryReset={() => setAttempt((n) => n + 1)}
    >
      <Suspense fallback={skeleton ?? <SkeletonStat />}>{children}</Suspense>
    </PanelErrorBoundary>
  );
}
