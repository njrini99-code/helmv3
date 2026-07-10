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
      route="/golf/dashboard/qualifiers/[id]/edit"
      component="EditQualifierPage"
      title="Failed to load qualifier editor"
      message="We couldn't load the qualifier editor. Please try again."
      homePath="/golf/dashboard/qualifiers"
    />
  );
}
