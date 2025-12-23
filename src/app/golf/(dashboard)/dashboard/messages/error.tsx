'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { IconAlertTriangle } from '@/components/icons';

export default function MessagesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Messages page error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF6F1] p-4">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <IconAlertTriangle size={32} className="text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">
          Something went wrong
        </h2>
        <p className="text-slate-500 mb-6 max-w-md">
          {error.message || 'We encountered an error loading messages. Please try again.'}
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="secondary" onClick={() => window.location.href = '/golf/dashboard'}>
            Go to Dashboard
          </Button>
          <Button onClick={reset}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
