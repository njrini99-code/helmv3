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
      route="/golf/admin/demo-sessions"
      component="GolfAdminDemoSessionsPage"
      title="Failed to load demo sessions"
      message="We couldn't load demo sessions. Please try again."
      homePath="/golf/admin"
    />
  );
}
