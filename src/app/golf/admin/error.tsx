'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-warm-900 mb-2">Something went wrong</h2>
        <p className="text-warm-500 mb-2">An unexpected error occurred.</p>
        {/* TEMP DEBUG: surface the real error message for admins so we can
         * diagnose the refactor without pulling server logs. Remove once
         * admin-data.ts is stable. */}
        <pre className="text-left text-xs bg-warm-50 border border-warm-200 rounded p-3 mb-4 overflow-auto max-h-64 whitespace-pre-wrap">
          <strong>message:</strong> {error.message || '(empty)'}
          {'\n'}
          <strong>digest:</strong> {error.digest || '(none)'}
          {error.stack ? `\n\nstack:\n${error.stack}` : ''}
        </pre>
        <button
          onClick={reset}
          className="px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-medium"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
