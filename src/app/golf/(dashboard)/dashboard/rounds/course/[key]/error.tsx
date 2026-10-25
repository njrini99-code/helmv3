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
      route="/golf/dashboard/rounds/course/[key]"
      component="CourseHistoryPage"
      title="Failed to load course history"
      message="We couldn't load your history at this course. Please try again."
      homePath="/golf/dashboard/rounds"
    />
  );
}
