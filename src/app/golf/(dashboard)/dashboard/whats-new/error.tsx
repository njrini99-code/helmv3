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
      route="/golf/dashboard/whats-new"
      component="WhatsNewPage"
      title="Failed to load updates"
      message="We couldn't load What's New. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
