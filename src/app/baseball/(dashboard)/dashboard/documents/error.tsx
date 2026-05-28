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
      route="/baseball/dashboard/documents"
      component="BaseballDocumentsPage"
      title="Failed to load documents"
      message="We couldn't load documents. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
