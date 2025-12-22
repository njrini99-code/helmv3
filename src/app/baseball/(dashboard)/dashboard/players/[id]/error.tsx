'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { logError } from '@/lib/error-logging';

export default function PlayerProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError(error, {
      component: 'PlayerProfilePage',
      route: '/baseball/dashboard/players/[id]',
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
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
      </div>

      <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-2">
        Failed to load player profile
      </h3>
      <p className="text-sm leading-relaxed text-slate-500 mb-4 max-w-md">
        We couldn't load this player's profile. The player may not exist, or there might be a connection issue.
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
          onClick={() => window.history.back()}
        >
          Go Back
        </Button>
        <Button variant="primary" onClick={reset}>
          Try Again
        </Button>
      </div>
    </div>
  );
}
