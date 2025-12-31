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
      route="/golf/dashboard/rounds/[id]"
      component="RoundDetailPage"
      title="Failed to load round"
      message="We couldn't load this golf round. It may not exist or there might be a connection issue."
      homePath="/golf/dashboard/rounds"
    />
  );
}
