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
      route="/baseball/dashboard/settings/teams"
      component="TeamSettingsPage"
      title="Couldn't load team settings"
      message="We couldn't load your team settings. Please try again."
      homePath="/baseball/dashboard/settings"
    />
  );
}
