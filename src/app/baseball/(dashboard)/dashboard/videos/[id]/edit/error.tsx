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
      route="/baseball/dashboard/videos/[id]/edit"
      component="VideoEditPage"
      title="Failed to load video editor"
      message="We couldn't load the video editor. Please try again."
      homePath="/baseball/dashboard/videos"
    />
  );
}
