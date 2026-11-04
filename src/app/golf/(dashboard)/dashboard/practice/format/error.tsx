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
      route="/golf/dashboard/practice/format"
      component="PlanFormatPage"
      title="Failed to load Plan format"
      message="We couldn't load your plan format. Please try again."
      homePath="/golf/dashboard/practice"
    />
  );
}
