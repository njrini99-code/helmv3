'use client';

import { Button } from '@/components/ui/button';
import { IconWarning } from '@/components/icons';

export default function MessagesError({
  _error,
  reset,
}: {
  _error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error(_error);
  return (
    <div className="min-h-full flex items-center justify-center bg-transparent p-4">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <IconWarning size={32} className="text-red-500" />
        </div>
        <h2 className="text-[20px] font-medium text-warm-900 tracking-[-0.015em] mb-2">
          Something went wrong
        </h2>
        <p className="text-warm-500 mb-6 max-w-md">
          {'We encountered an error loading messages. Please try again.'}
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
