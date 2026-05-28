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
      route="/baseball/dashboard/team/high-school"
      component="HighSchoolTeamPage"
      title="Failed to load team"
      message="We couldn't load your high school team. Please try again."
      homePath="/baseball/dashboard/team"
    />
  );
}
