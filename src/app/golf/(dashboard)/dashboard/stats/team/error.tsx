'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { IconAlertCircle, IconRefresh } from '@/components/icons';

export default function TeamStatsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Team stats error:', error);
  }, [error]);

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
          <IconAlertCircle size={32} className="text-rose-500" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">
          Failed to Load Team Stats
        </h2>
        <p className="text-slate-500 mb-6">
          There was an error loading your team statistics. Please try again.
        </p>
        <Button onClick={reset} className="gap-2">
          <IconRefresh size={16} />
          Try Again
        </Button>
      </div>
    </div>
  );
}
