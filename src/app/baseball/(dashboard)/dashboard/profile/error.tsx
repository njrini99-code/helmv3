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
      route="/baseball/dashboard/profile"
      component="BaseballProfilePage"
      title="Failed to load profile"
      message="We couldn't load your profile. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
