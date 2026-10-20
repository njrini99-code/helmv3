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
      route="/golf/dashboard/qualifiers/[id]/selection"
      component="QualifierSelectionPage"
      title="Failed to load selections"
      message="We couldn't load this qualifier's selections. Please try again."
      homePath="/golf/dashboard/qualifiers"
    />
  );
}
