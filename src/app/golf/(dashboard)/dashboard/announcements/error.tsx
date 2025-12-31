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
      route="/golf/dashboard/announcements"
      component="AnnouncementsPage"
      title="Failed to load announcements"
      message="We couldn't load the announcements. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
