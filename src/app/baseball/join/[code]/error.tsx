'use client';

import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF6F1]">
      <div className="text-center p-8 max-w-md">
        <h2 className="text-xl font-semibold text-slate-900 mb-2">
          Unable to Join Team
        </h2>
        <p className="text-slate-600 mb-4">{error.message}</p>
        <p className="text-sm text-slate-500 mb-6">
          This invite link may be invalid, expired, or already used.
          Please contact your coach for a new invite link.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            aria-label="Try again"
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 active:bg-primary-800 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/baseball/login"
            className="px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
