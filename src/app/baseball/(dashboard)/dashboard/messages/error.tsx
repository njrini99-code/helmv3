'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { logError } from '@/lib/error-logging';

export default function MessagesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError(error, {
      component: 'MessagesPage',
      route: '/baseball/dashboard/messages',
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
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </div>

      <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-2">
        Failed to load messages
      </h3>
      <p className="text-sm leading-relaxed text-slate-500 mb-4 max-w-md">
        We couldn't load your conversations. This might be a temporary connection issue. Please try again.
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
          onClick={() => window.location.href = '/baseball/dashboard/messages'}
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
