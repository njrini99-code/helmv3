'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Error boundary caught:', error);
  }, [error]);

  return (
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
          <h2 className="text-2xl font-semibold text-slate-900">Something went wrong</h2>
          <p className="text-slate-500 mt-2">
            We encountered an unexpected error. Please try again.
          </p>
          {error.digest && (
            <p className="text-xs text-slate-400 mt-2 font-mono">
              Error ID: {error.digest}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={reset} variant="secondary">
            Try again
          </Button>
          <Link href="/">
            <Button>Go to Home</Button>
          </Link>
        </div>

        <p className="text-sm text-slate-400 mt-8">
          If this problem persists,{' '}
          <Link href="mailto:support@helmlab.com" className="text-green-600 hover:underline">
            contact support
          </Link>
        </p>
      </div>
    </div>
  );
}
