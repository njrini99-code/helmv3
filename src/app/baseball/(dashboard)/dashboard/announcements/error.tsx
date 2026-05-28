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
      route="/baseball/dashboard/announcements"
      component="BaseballAnnouncementsPage"
      title="Failed to load announcements"
      message="We couldn't load announcements. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
