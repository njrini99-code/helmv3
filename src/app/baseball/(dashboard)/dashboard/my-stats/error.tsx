'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { IconChart, IconRefresh, IconHome } from '@/components/icons';
import { logError } from '@/lib/error-logging';

export default function MyStatsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError(error, {
      component: 'MyStatsPage',
      route: '/baseball/dashboard/my-stats',
      digest: error.digest,
    }, 'high');
  }, [error]);

  return (
    <div className="min-h-dvh bg-[#FFFEFA] flex items-center justify-center p-4">
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        {/* Error Icon */}
        <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center mb-4">
          <IconChart size={28} className="text-red-500" />
        </div>

        {/* Error Message */}
        <h2 className="text-xl font-semibold tracking-tight text-warm-900 mb-2">
          Unable to Load Stats
        </h2>
        <p className="text-sm leading-relaxed text-warm-600 mb-6">
          {error.message || 'An error occurred while loading your stats. Please try again.'}
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

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          <Button
            variant="outline"
            onClick={() => window.location.href = '/baseball/dashboard'}
            className="flex items-center gap-2"
          >
            <IconHome size={16} />
            Dashboard
          </Button>
          <Button onClick={reset} className="flex items-center gap-2">
            <IconRefresh size={16} />
            Try Again
          </Button>
        </div>
      </div>
    </div>
  );
}
