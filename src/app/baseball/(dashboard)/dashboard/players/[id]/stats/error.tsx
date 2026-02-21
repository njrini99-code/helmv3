'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { IconArrowLeft, IconChart, IconRefresh } from '@/components/icons';
import { logError } from '@/lib/error-logging';
import Link from 'next/link';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PlayerStatsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    logError(error, {
      component: 'PlayerStatsPage',
      route: '/baseball/dashboard/players/[id]/stats',
      digest: error.digest,
    }, 'medium');
  }, [error]);

  return (
    <div className="min-h-screen bg-[#FFFEFA]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div
            className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-4"
            aria-hidden="true"
          >
            <IconChart size={24} className="text-red-600" />
          </div>

          <h1 className="text-xl font-semibold text-warm-900 mb-2">
            Failed to load player stats
          </h1>
          <p className="text-sm text-warm-500 mb-6 max-w-md">
            We couldn&apos;t load the statistics for this player. This might be a temporary issue.
            Please try again.
          </p>

          {process.env.NODE_ENV === 'development' && error && (
            <details className="mb-6 max-w-md w-full text-left">
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

          <div className="flex gap-3">
            <Link href="/baseball/dashboard/roster">
              <Button variant="secondary">
                <IconArrowLeft size={16} />
                Back to Roster
              </Button>
            </Link>
            <Button variant="primary" onClick={reset}>
              <IconRefresh size={16} />
              Try Again
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
