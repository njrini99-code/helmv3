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
      route="/golf/dashboard/courses"
      component="CoursesPage"
      title="Failed to load courses"
      message="We couldn't load the course library. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
