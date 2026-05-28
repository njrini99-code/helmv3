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
      route="/golf/dashboard/my-qualifiers"
      component="MyQualifiersPage"
      title="Failed to load qualifiers"
      message="We couldn't load your qualifiers. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
