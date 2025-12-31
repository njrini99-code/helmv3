'use client';

import { useEffect } from 'react';
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
}: RouteErrorBoundaryProps) {
  useEffect(() => {
    // Log error to monitoring service
    logError(error, {
      component: component || route,
      route,
      digest: error.digest,
    }, 'high');
  }, [error, route, component]);

  const defaultMessage = error.message || 'An unexpected error occurred. Please try refreshing the page.';

  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 max-w-md w-full text-center">
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
        <h2 className="text-xl font-semibold tracking-tight text-slate-900 mb-2">
          {title}
        </h2>

        {/* Error Message */}
        <p className="text-sm leading-relaxed text-slate-600 mb-6">
          {message || defaultMessage}
        </p>

        {/* Error Details (Development Only) */}
        {process.env.NODE_ENV === 'development' && (
          <details className="mb-6 text-left">
            <summary className="text-xs font-medium text-slate-500 cursor-pointer hover:text-slate-700 mb-2">
              Error Details
            </summary>
            <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto max-h-32 text-red-600">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
              {error.digest && `\n\nDigest: ${error.digest}`}
            </pre>
          </details>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          {showHomeButton && homePath && (
            <Button
              variant="secondary"
              onClick={() => window.location.href = homePath}
            >
              Go Home
            </Button>
          )}
          <Button variant="primary" onClick={reset}>
            Try Again
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
      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        {title}
      </h3>

      {/* Error Message */}
      <p className="text-sm leading-relaxed text-slate-500 mb-4 max-w-md">
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
