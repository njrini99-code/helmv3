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
      route="/baseball/dashboard/videos"
      component="VideosPage"
      title="Failed to load videos"
      message="We couldn't load videos. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
