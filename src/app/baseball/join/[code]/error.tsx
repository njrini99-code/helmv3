'use client';

import Link from 'next/link';
import { IconWarning, IconRefresh, IconArrowLeft } from '@/components/icons';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-auth-baseball p-4 sm:p-6">
      <div className="text-center p-6 sm:p-8 max-w-md w-full bg-white/80 backdrop-blur-xl rounded-2xl border border-white/30">
        <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <IconWarning size={32} className="text-amber-600" />
        </div>
        <h2 className="text-xl font-semibold text-warm-900 mb-2">
          Unable to Join Team
        </h2>
        <p className="text-warm-600 mb-4">{error.message}</p>
        <p className="text-sm text-warm-500 mb-6">
          This invite link may be invalid, expired, or already used.
          Please contact your coach for a new invite link.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            aria-label="Try again"
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 active:bg-primary-800 transition-colors"
          >
            <IconRefresh size={18} />
            Try again
          </button>
          <Link
            href="/baseball/dashboard"
            className="flex items-center justify-center gap-2 px-4 py-2.5 text-warm-600 hover:text-warm-900 transition-colors"
          >
            <IconArrowLeft size={18} />
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
