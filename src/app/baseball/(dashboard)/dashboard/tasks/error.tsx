'use client';

import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-8">
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-lg p-8 max-w-md text-center">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-slate-600 mb-6">
          {error.message || 'We encountered an error loading this page.'}
        </p>
        <Button onClick={reset}>Try Again</Button>
      </div>
    </div>
  );
}
