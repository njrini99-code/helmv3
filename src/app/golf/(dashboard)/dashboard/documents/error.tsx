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
      route="/golf/dashboard/documents"
      component="DocumentsPage"
      title="Failed to load documents"
      message="We couldn't load your documents. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
