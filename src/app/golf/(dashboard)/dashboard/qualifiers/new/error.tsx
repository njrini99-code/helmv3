'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { IconArrowLeft } from '@/components/icons';

export default function NewQualifierError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-full bg-transparent">
      {/* Header */}
      <div className="border-b border-warm-200/60 bg-white/50 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/golf/dashboard/qualifiers"
              className="p-2 -ml-2 rounded-lg text-warm-500 hover:text-warm-700 hover:bg-warm-100 active:bg-warm-200 transition-colors"
            >
              <IconArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-warm-900">Create Qualifier</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Error content */}
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-warm-900 mb-2">Something went wrong</h2>
          <p className="text-warm-500 mb-6">We couldn&apos;t load the create qualifier form. Please try again.</p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="secondary" onClick={() => reset()}>
              Try Again
            </Button>
            <Link href="/golf/dashboard/qualifiers">
              <Button variant="ghost">Back to Qualifiers</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
