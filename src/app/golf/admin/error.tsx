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
      route="/golf/admin"
      component="GolfAdminPage"
      title="Failed to load admin"
      message="We couldn't load the admin dashboard. Please try again."
      homePath="/golf/admin"
    />
  );
}
