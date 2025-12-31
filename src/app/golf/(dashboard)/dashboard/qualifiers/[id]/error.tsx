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
      route="/golf/dashboard/qualifiers/[id]"
      component="QualifierDetailPage"
      title="Failed to load qualifier"
      message="We couldn't load this qualifier. It may not exist or there might be a connection issue."
      homePath="/golf/dashboard/qualifiers"
    />
  );
}
