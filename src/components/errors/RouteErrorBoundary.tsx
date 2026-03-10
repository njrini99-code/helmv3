'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { logError } from '@/lib/error-logging';

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
 * Check if an error is from a stale server action (deployment mismatch).
 * Like chunk load errors, these need a full page reload.
 */
function isStaleActionError(error: Error): boolean {
  const msg = error.message || '';
  return msg.includes('not found on the server') || msg.includes('Server Action');
}

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
  const isStaleAction = isStaleActionError(error);
  const isTransient = isTransientError(error);

  // For chunk load or stale server action errors, a full page reload is the only real fix
  useEffect(() => {
    if (isChunk || isStaleAction) {
      const key = isChunk ? 'chunk-error-reload' : 'stale-action-reload';
      const hasReloaded = sessionStorage.getItem(key);
      if (!hasReloaded) {
        sessionStorage.setItem(key, Date.now().toString());
        window.location.reload();
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
    }, 'high');
  }, [error, route, component]);

  // Auto-retry once for transient errors
  useEffect(() => {
    if (autoRetry && isTransient && retryCount === 0) {
      const timer = setTimeout(() => {
        handleRetry();
      }, 2000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [autoRetry, isTransient, retryCount, handleRetry]);

  // Better default messages for different error types
  const getDefaultMessage = () => {
    if (isChunk) {
      return 'A new version of the app is available. Please refresh the page to continue.';
    }
    if (isTransient) {
      return 'Our servers are temporarily busy. This usually resolves quickly.';
    }
    return error.message || 'An unexpected error occurred. Please try refreshing the page.';
  };

  const defaultMessage = getDefaultMessage();

  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-warm-200 shadow-lg p-8 max-w-md w-full text-center">
        {/* Error Icon */}
        <div className="w-16 h-16 mx-auto rounded-2xl bg-red-100 flex items-center justify-center mb-4">
          <svg
            className="h-8 w-8 text-red-600"
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
        <h2 className="text-xl font-semibold tracking-tight text-warm-900 mb-2">
          {title}
        </h2>

        {/* Error Message */}
        <p className="text-sm leading-relaxed text-warm-600 mb-6">
          {message || defaultMessage}
        </p>

        {/* Error Details (Development Only) */}
        {process.env.NODE_ENV === 'development' && (
          <details className="mb-6 text-left">
            <summary className="text-xs font-medium text-warm-500 cursor-pointer hover:text-warm-700 mb-2">
              Error Details
            </summary>
            <pre className="text-xs bg-warm-50 border border-warm-200 rounded-lg p-3 overflow-auto max-h-32 text-red-600">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
              {error.digest && `\n\nDigest: ${error.digest}`}
            </pre>
          </details>
        )}

        {/* Retry indicator */}
        {isRetrying && (
          <div className="mb-4 flex items-center justify-center gap-2 text-sm text-warm-500">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Retrying...
          </div>
        )}

        {/* Retry count indicator */}
        {retryCount > 0 && !isRetrying && (
          <p className="text-xs text-warm-400 mb-4">
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
function CompactRouteErrorBoundary({
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
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {/* Error Icon */}
      <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
        <svg
          className="h-6 w-6 text-red-600"
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
      <h3 className="text-lg font-semibold text-warm-900 mb-2">
        {title}
      </h3>

      {/* Error Message */}
      <p className="text-sm leading-relaxed text-warm-500 mb-4 max-w-md">
        {message || error.message || 'Please try again.'}
      </p>

      {/* Error Details (Development Only) */}
      {process.env.NODE_ENV === 'development' && (
        <p className="text-xs text-red-600 mb-4 font-mono max-w-md break-words">
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
