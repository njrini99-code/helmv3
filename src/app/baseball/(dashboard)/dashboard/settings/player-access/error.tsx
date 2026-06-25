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
      route="/baseball/dashboard/settings/player-access"
      component="PlayerAccessSettingsPage"
      title="Couldn't load player access settings"
      message="We couldn't load player access settings. Please try again."
      homePath="/baseball/dashboard/settings"
    />
  );
}
