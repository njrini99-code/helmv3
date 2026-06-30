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
      route="/golf/dashboard/qualifiers/create"
      component="NewQualifierPage"
      title="Failed to load qualifier builder"
      message="We couldn't load the qualifier builder. Please try again."
      homePath="/golf/dashboard/qualifiers"
    />
  );
}
