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
      route="/golf/dashboard/recruiting"
      component="RecruitingPage"
      title="Failed to load recruiting"
      message="We couldn't load recruiting. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
