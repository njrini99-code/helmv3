'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { logError } from '@/lib/error-logging';

export default function DiscoverError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError(error, {
      component: 'DiscoverPage',
      route: '/baseball/dashboard/discover',
      digest: error.digest,
    }, 'medium');
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
        <svg
          className="h-8 w-8 text-red-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-2">
        Failed to load players
      </h3>
      <p className="text-sm leading-relaxed text-slate-500 mb-4 max-w-md">
        We couldn't load the player list. This might be a temporary connection issue or a problem with the filters you've applied.
      </p>

      {process.env.NODE_ENV === 'development' && error && (
        <details className="mb-4 max-w-md w-full">
          <summary className="text-xs font-medium text-slate-500 cursor-pointer hover:text-slate-700 mb-2">
            Error Details
          </summary>
          <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto max-h-32 text-red-600 text-left">
            {error.message}
            {error.stack && `\n\n${error.stack}`}
            {error.digest && `\n\nDigest: ${error.digest}`}
          </pre>
        </details>
      )}

      <div className="flex gap-3">
        <Button
          variant="secondary"
          onClick={() => window.location.href = '/baseball/dashboard/discover'}
        >
          Refresh Page
        </Button>
        <Button variant="primary" onClick={reset}>
          Try Again
        </Button>
      </div>
    </div>
  );
}
