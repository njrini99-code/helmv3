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
      route="/baseball/dashboard/tasks"
      component="BaseballTasksPage"
      title="Failed to load tasks"
      message="We couldn't load your tasks. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
