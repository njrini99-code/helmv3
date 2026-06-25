'use client';

import { RouteErrorBoundary } from '@/components/errors';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorBoundary
      error={error}
      reset={reset}
      route="/baseball/dashboard/performance/programs/[programId]"
      component="BaseballProgramEditor"
      title="Program editor error"
      message="We couldn't load this program. Please try again."
      homePath="/baseball/dashboard/performance/programs"
    />
  );
}
