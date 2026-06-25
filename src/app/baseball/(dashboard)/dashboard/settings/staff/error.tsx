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
      route="/baseball/dashboard/settings/staff"
      component="BaseballStaffSettingsPage"
      title="Couldn't load staff settings"
      message="We couldn't load your coaching staff. You may not have access, or there was a problem. Please try again."
      homePath="/baseball/dashboard/settings"
    />
  );
}
