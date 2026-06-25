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
      route="/baseball/dashboard/settings/program"
      component="BaseballProgramSettingsPage"
      title="Couldn't load program settings"
      message="We couldn't load your program settings. You may not have access, or there was a problem. Please try again."
      homePath="/baseball/dashboard/settings"
    />
  );
}
