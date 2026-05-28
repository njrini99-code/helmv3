'use client';

import { RouteErrorBoundary } from '@/components/errors';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorBoundary
      error={error}
      reset={reset}
      route="/baseball/dashboard/program"
      component="ProgramPage"
      title="Failed to load program"
      message="We couldn't load your program. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
