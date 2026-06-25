'use client';

import { RouteErrorBoundary } from '@/components/errors';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorBoundary
      error={error}
      reset={reset}
      route="/baseball/dashboard/performance/programs"
      component="BaseballProgramBuilder"
      title="Program builder error"
      message="We couldn't load the program builder. Please try again."
      homePath="/baseball/dashboard/performance"
    />
  );
}
