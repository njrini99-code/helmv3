'use client';

import { useEffect } from 'react';
import { logError } from '@/lib/error-logging';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error boundary caught:', error);
    logError(error, {
      component: 'GlobalErrorBoundary',
      action: 'render',
      digest: error.digest ?? null,
      route: typeof window !== 'undefined' ? window.location.href : undefined,
    }, 'critical');
  }, [error]);

  return (
    <html>
      <body>
        <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <div className="mb-8">
              <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-10 h-10 text-red-500"
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
              <h2 className="text-2xl font-semibold text-warm-900">Critical Error</h2>
              <p className="text-warm-500 mt-2">
                We encountered a critical error. Please refresh the page.
              </p>
              {error.digest && (
                <p className="text-xs text-warm-400 mt-2 font-mono">
                  Error ID: {error.digest}
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="ghost"
                onClick={reset}
                className="px-4 py-2 bg-white hover:bg-warm-50 text-warm-700 border border-warm-200 hover:border-warm-300 rounded-lg font-medium transition-colors"
              >
                Try again
              </Button>
              <a
                href="/"
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
              >
                Go to Home
              </a>
            </div>

            <p className="text-sm text-warm-400 mt-8">
              If this problem persists,{' '}
              <a href="mailto:admin@helmsportslabs.com" className="text-primary-600 hover:underline">
                contact support
              </a>
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
