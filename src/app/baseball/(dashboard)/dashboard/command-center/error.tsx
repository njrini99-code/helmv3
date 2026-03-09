'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { IconAlertCircle, IconRefresh } from '@/components/icons';

export default function CommandCenterError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Command Center Error:', error);
  }, [error]);

  return (
    <div className="min-h-dvh bg-[#FFFEFA] flex items-center justify-center">
      <div className="max-w-md mx-auto px-4 text-center">
        <div className="glass-standard rounded-2xl p-8">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <IconAlertCircle size={24} className="text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            Something went wrong
          </h2>
          <p className="text-slate-600 mb-6">
            We encountered an error loading the Command Center. Please try again.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={reset} className="gap-2">
              <IconRefresh size={18} />
              Try Again
            </Button>
            <Button variant="secondary" onClick={() => window.location.href = '/baseball/dashboard'}>
              Go to Dashboard
            </Button>
          </div>
          {error.digest && (
            <p className="text-xs text-slate-400 mt-4">
              Error ID: {error.digest}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
