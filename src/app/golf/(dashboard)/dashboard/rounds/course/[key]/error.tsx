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
      title="Failed to load this course"
      message="We couldn't load this course's rounds. Try again in a moment."
      homePath="/golf/dashboard/rounds"
    />
  );
}
