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
      route="/baseball/dashboard/videos/[id]"
      component="VideoDetailPage"
      title="Failed to load video"
      message="We couldn't load this video. Please try again."
      homePath="/baseball/dashboard/videos"
    />
  );
}
