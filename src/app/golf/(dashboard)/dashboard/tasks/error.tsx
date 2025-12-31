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
      route="/golf/dashboard/tasks"
      component="TasksPage"
      title="Failed to load tasks"
      message="We couldn't load your tasks. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
