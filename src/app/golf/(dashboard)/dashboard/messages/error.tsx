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
      route="/golf/dashboard/messages"
      component="MessagesPage"
      title="Failed to load messages"
      message="We couldn't load your messages. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
