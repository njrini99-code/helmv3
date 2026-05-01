'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { IconAlertCircle, IconRefresh } from '@/components/icons';

export default function StatsUploadError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Stats upload error:', error);
  }, [error]);

  return (
    <div className="min-h-dvh bg-[#FFFEFA] flex items-center justify-center p-4">
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <IconAlertCircle size={32} className="text-red-600" />
        </div>
        <h2 className="text-xl font-semibold text-warm-900 mb-2">
          Something went wrong
        </h2>
        <p className="text-warm-500 mb-6">
          We couldn&apos;t load the stats upload page. This might be a temporary issue.
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="secondary" onClick={() => window.history.back()}>
            Go Back
          </Button>
          <Button onClick={reset} className="gap-2">
            <IconRefresh size={16} />
            Try Again
          </Button>
        </div>
      </div>
    </div>
  );
}
