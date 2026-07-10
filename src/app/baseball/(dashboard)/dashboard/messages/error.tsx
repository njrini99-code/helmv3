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
      route="/baseball/dashboard/messages"
      component="MessagesPage"
      title="Failed to load messages"
      message="We couldn't load your conversations. This might be a temporary connection issue. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
