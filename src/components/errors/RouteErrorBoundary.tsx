'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  logError,
  isStaleServerActionError,
  softReloadForStaleServerAction,
  STALE_ACTION_RELOAD_KEY,
} from '@/lib/error-logging';

interface RouteErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** The route path for logging context (e.g., '/baseball/dashboard') */
  route: string;
  /** Optional: Component name for logging (defaults to route) */
  component?: string;
  /** Optional: Custom error title */
  title?: string;
  /** Optional: Custom error message */
  message?: string;
  /** Optional: Custom home path for "Go Home" button */
  homePath?: string;
  /** Optional: Show home button (default: true) */
  showHomeButton?: boolean;
  /** Optional: Enable auto-retry for transient errors (default: true) */
  autoRetry?: boolean;
}

/**
 * Check if an error is a stale deployment chunk load error.
 * These require a full page reload (not just reset) to fetch new deployment manifest.
 */
function isChunkLoadError(error: Error): boolean {
  const msg = error.message?.toLowerCase() || '';
  return (
    msg.includes('loading chunk') ||
    msg.includes('loading css chunk') ||
    msg.includes('chunkloaderror') ||
    (msg.includes("cannot read properties of undefined") && msg.includes("'call'"))
  );
}

/**
 * Stale-server-action detection lives in `@/lib/error-logging` so the global
 * unhandledrejection/error handlers and this boundary share one regex and
 * one reload-once-per-session guard. See `isStaleServerActionError` and
 * `softReloadForStaleServerAction` in that module.
 */

/**
 * Check if an error appears to be transient (retryable)
 */
function isTransientError(error: Error): boolean {
  const msg = error.message?.toLowerCase() || '';
  return (
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('timeout') ||
    msg.includes('connection') ||
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('unavailable') ||
    msg.includes('temporarily')
  );
}

function isGenericLoadFailure(error: Error): boolean {
  const msg = error.message?.toLowerCase() || '';
  return msg === 'load failed' || msg === 'failed to fetch';
}

/**
 * An HTTP 5xx surfaced in the error message is a BACKEND failure, not
 * client-side transience. `isTransientError` matches 502/503/504 (so we still
 * auto-retry them), but for LOGGING they must stay at 'error' severity — a real
 * outage has to cross Sentry's error alert threshold even though we retry it.
 * Only pure client transience (raw `TypeError: network error`, timeouts,
 * "Load failed") gets the noise-reducing downgrade.
 */
function isServerStatusError(error: Error): boolean {
  const msg = error.message?.toLowerCase() || '';
  return msg.includes('502') || msg.includes('503') || msg.includes('504');
}

/**
 * Reusable Route Error Boundary Component
 *
 * Use this in Next.js 13+ error.tsx files to handle route-level errors
 * with consistent UI and error logging.
 *
 * @example Basic usage
 * ```tsx
 * // app/baseball/(dashboard)/dashboard/discover/error.tsx
 * export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void; }) {
 *   return (
 *     <RouteErrorBoundary
 *       error={error}
 *       reset={reset}
 *       route="/baseball/dashboard/discover"
 *       title="Failed to load players"
 *       message="We couldn't load the player list. This might be a temporary issue."
 *       homePath="/baseball/dashboard"
 *     />
 *   );
 * }
 * ```
 *
 * @example Minimal usage (uses defaults)
 * ```tsx
 * export default function Error(props) {
 *   return <RouteErrorBoundary {...props} route="/baseball/dashboard" />;
 * }
 * ```
 */
export function RouteErrorBoundary({
  error,
  reset,
  route,
  component,
  title = 'Something went wrong',
  message,
  homePath,
  showHomeButton = true,
  autoRetry = true,
}: RouteErrorBoundaryProps) {
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  const isChunk = isChunkLoadError(error);
  const isStaleAction = isStaleServerActionError(error);
  const isTransient = isTransientError(error);
  const isGenericLoad = isGenericLoadFailure(error);
  const isServer5xx = isServerStatusError(error);

  // For chunk load or stale server action errors, a full page reload is the only real fix.
  // Stale-action reloads delegate to softReloadForStaleServerAction so this boundary and the
  // global unhandledrejection/error handlers share state — they cannot each "first-reload"
  // the same session.
  useEffect(() => {
    if (isStaleAction) {
      softReloadForStaleServerAction();
      return;
    }
    if (isChunk) {
      try {
        const hasReloaded = sessionStorage.getItem('chunk-error-reload');
        if (!hasReloaded) {
          sessionStorage.setItem('chunk-error-reload', Date.now().toString());
          window.location.reload();
        }
      } catch {
        // sessionStorage unavailable — skip reload to avoid a loop.
      }
    }
  }, [isChunk, isStaleAction]);

  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    // Small delay before retry
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRetryCount(prev => prev + 1);
    try {
      reset();
    } finally {
      setIsRetrying(false);
    }
  }, [reset]);

  useEffect(() => {
    // Log error to monitoring service
    logError(error, {
      component: component || route,
      route,
      digest: error.digest,
      boundary: 'route',
      errorKind: isChunk
        ? 'chunk-load'
        : isStaleAction
          ? 'stale-server-action'
          : isTransient
            ? 'transient-network'
            : isGenericLoad
              ? 'generic-load-failure'
              : 'unknown-route-error',
      isChunkLoadError: isChunk,
      isStaleActionError: isStaleAction,
      isTransientError: isTransient,
      isGenericLoadFailure: isGenericLoad,
      retryCount,
      sessionReloadFlags: (() => {
        if (typeof window === 'undefined') return { chunkErrorReloaded: null, staleActionReloaded: null };
        try {
          return {
            chunkErrorReloaded: sessionStorage.getItem('chunk-error-reload'),
            staleActionReloaded: sessionStorage.getItem(STALE_ACTION_RELOAD_KEY),
          };
        } catch {
          // sessionStorage may throw in private mode; surface that explicitly so we
          // don't get a misleading "no reload happened" signal in error logs.
          return { chunkErrorReloaded: 'unavailable', staleActionReloaded: 'unavailable' };
        }
      })(),
      // Transient-network and generic-load failures are auto-retried below and
      // shown to the user as "temporary" — they are NOT incidents. Logging them
      // at 'error' let a single flaky/backgrounded tab flood error_logs + Sentry
      // (one client wrote 320 `severity:error` rows from /rounds/new in 8h).
      // Downgrade to 'medium' (warning) so they stay discoverable without
      // polluting the error feed — but ONLY for pure client transience. A real
      // HTTP 5xx (isServer5xx) stays at 'high' so a backend outage still pages,
      // and unknown errors keep 'high' too.
      //
      // Chunk-load is ALSO not an incident (stale assets after a deploy, with a
      // one-shot reload that recovers it), but it is capped centrally in
      // logError rather than here — the global window handlers hit the same
      // class and must reach the same tier. See capSeverityForSelfRecovering.
    }, (isTransient || isGenericLoad) && !isServer5xx ? 'medium' : 'high');
  }, [error, route, component, isChunk, isStaleAction, isTransient, isGenericLoad, isServer5xx, retryCount]);

  // Auto-retry for transient errors OR generic load failures. Two guards stop the
  // self-perpetuating retry loop a backgrounded /rounds/new tab created: reset()
  // remounts this boundary and resets the in-component retryCount to 0, so
  // component state alone can never cap retries across reset cycles.
  useEffect(() => {
    if (!autoRetry || !(isTransient || isGenericLoad) || retryCount !== 0) {
      return undefined;
    }

    // 1. Never auto-retry a hidden tab: the user isn't watching and retrying a
    //    transient just spins. Every flood record had visibilityState 'hidden'.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return undefined;
    }

    // 2. Persistent, remount-surviving budget so reset()-driven remounts can't
    //    re-arm the one-shot retry forever (mirrors the chunk/stale guards above).
    const AUTO_RETRY_BUDGET = 2;
    const budgetKey = `route-auto-retry:${route}`;
    let used = 0;
    try {
      used = Number(sessionStorage.getItem(budgetKey)) || 0;
    } catch {
      used = 0;
    }
    if (used >= AUTO_RETRY_BUDGET) {
      return undefined;
    }

    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(budgetKey, String(used + 1));
      } catch {
        // best-effort; the visibility gate already breaks the loop
      }
      handleRetry();
    }, 2000);
    return () => clearTimeout(timer);
  }, [autoRetry, isTransient, isGenericLoad, retryCount, handleRetry, route]);

  // Better default messages for different error types
  const getDefaultMessage = () => {
    if (isChunk) {
      return 'A new version of the app is available. Please refresh the page to continue.';
    }
    if (isTransient) {
      return 'Our servers are temporarily busy. This usually resolves quickly.';
    }
    if (isGenericLoad) {
      return 'Your browser could not load this page data. Please try again or refresh the page.';
    }
    return error.message || 'An unexpected error occurred. Please try refreshing the page.';
  };

  const defaultMessage = getDefaultMessage();

  return (
    <div className="min-h-dvh bg-canvas flex items-center justify-center p-6 font-fw-sans">
      <div className="bg-surface rounded-card border border-border-subtle shadow-soft p-8 max-w-md w-full text-center">
        {/* Error Icon */}
        <div className="w-16 h-16 mx-auto rounded-card bg-fw-danger-bg flex items-center justify-center mb-4">
          <svg
            className="h-8 w-8 text-fw-danger-ink"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Error Title */}
        <h2 className="font-fw-display text-h2 font-medium tracking-[-0.01em] text-text-primary mb-2">
          {title}
        </h2>

        {/* Error Message */}
        <p className="text-body leading-6 text-text-secondary mb-6">
          {message || defaultMessage}
        </p>

        {/* Error Details (Development Only) */}
        {process.env.NODE_ENV === 'development' && (
          <details className="mb-6 text-left">
            <summary className="text-body-sm font-medium text-text-tertiary cursor-pointer hover:text-text-secondary mb-2">
              Error Details
            </summary>
            <pre className="text-body-sm bg-surface-sunken border border-border-subtle rounded-fw-md p-3 overflow-auto max-h-32 text-fw-danger-ink">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
              {error.digest && `\n\nDigest: ${error.digest}`}
            </pre>
          </details>
        )}

        {/* Retry indicator */}
        {isRetrying && (
          <div className="mb-4 flex items-center justify-center gap-2 text-body-sm text-text-tertiary">
            <svg className="w-4 h-4 animate-spin motion-reduce:animate-none" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Retrying...
          </div>
        )}

        {/* Retry count indicator */}
        {retryCount > 0 && !isRetrying && (
          <p className="text-body-sm text-text-tertiary mb-4">
            {retryCount === 1 ? 'Retried once' : `Retried ${retryCount} times`}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          {showHomeButton && homePath && (
            <Button
              variant="secondary"
              onClick={() => window.location.href = homePath}
              disabled={isRetrying}
            >
              Go Home
            </Button>
          )}
          <Button variant="primary" onClick={handleRetry} disabled={isRetrying}>
            {isRetrying ? 'Retrying...' : 'Try Again'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact Route Error Boundary
 *
 * Use this for inline/embedded error states (not full-page errors)
 *
 * @example
 * ```tsx
 * <CompactRouteErrorBoundary
 *   error={error}
 *   reset={reset}
 *   route="/baseball/dashboard/watchlist"
 *   title="Failed to load watchlist"
 * />
 * ```
 */
export function CompactRouteErrorBoundary({
  error,
  reset,
  route,
  component,
  title = 'Failed to load',
  message,
}: Omit<RouteErrorBoundaryProps, 'homePath' | 'showHomeButton'>) {
  useEffect(() => {
    logError(error, {
      component: component || route,
      route,
      digest: error.digest,
    }, 'medium');
  }, [error, route, component]);

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center font-fw-sans">
      {/* Error Icon */}
      <div className="w-12 h-12 rounded-card bg-fw-danger-bg flex items-center justify-center mb-4">
        <svg
          className="h-6 w-6 text-fw-danger-ink"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      {/* Error Title */}
      <h3 className="font-fw-display text-body-lg font-medium text-text-primary mb-2">
        {title}
      </h3>

      {/* Error Message */}
      <p className="text-body leading-6 text-text-secondary mb-4 max-w-md">
        {message || error.message || 'Please try again.'}
      </p>

      {/* Error Details (Development Only) */}
      {process.env.NODE_ENV === 'development' && (
        <p className="text-body-sm text-fw-danger-ink mb-4 font-fw-mono max-w-md break-words">
          {error.message}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Refresh Page
        </Button>
        <Button variant="primary" onClick={reset}>
          Try Again
        </Button>
      </div>
    </div>
  );
}
