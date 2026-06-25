'use client';

// =============================================================================
// src/app/lifting/(dashboard)/dashboard/programs/[programId]/error.tsx
//
// Error boundary for the program editor. Surfaces a user-friendly message and
// a retry/back affordance. Never exposes raw error internals.
// =============================================================================

import { useEffect } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { IconAlertCircle } from '@/components/icons';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ProgramEditorError({ error, reset }: Props) {
  useEffect(() => {
    // Surface to Sentry via the global handler in instrumentation-client.ts.
    // No console.log — errors bubble through the existing Sentry integration.
  }, [error]);

  return (
    <div className="flex min-h-[400px] items-center justify-center p-8">
      <Card variant="overlay" className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <IconAlertCircle size={24} className="text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-warm-900">
              Could not load this program
            </h2>
            <p className="mt-1 text-sm text-warm-500">
              Something went wrong loading the program editor. Your data is safe.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/lifting/dashboard/programs"
              className="inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium text-warm-600 hover:bg-warm-50 transition-colors"
            >
              Back to programs
            </Link>
            <Button onClick={reset}>Try again</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
