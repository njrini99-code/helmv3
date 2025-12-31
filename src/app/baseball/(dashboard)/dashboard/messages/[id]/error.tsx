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
      route="/baseball/dashboard/messages/[id]"
      component="MessageThread"
      title="Failed to load conversation"
      message="We couldn't load this conversation. It may not exist or there might be a connection issue."
      homePath="/baseball/dashboard/messages"
    />
  );
}
