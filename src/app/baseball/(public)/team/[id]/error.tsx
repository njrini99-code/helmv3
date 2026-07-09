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
      route="/baseball/team/[id]"
      component="PublicTeamProfile"
      title="Failed to load team profile"
      message="We couldn't load this team's profile. The team may not exist or there might be a connection issue."
      homePath="/baseball/dashboard"
    />
  );
}
