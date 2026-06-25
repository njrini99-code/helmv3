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
      route="/baseball/dashboard/settings/guardian-access"
      component="GuardianAccessSettingsPage"
      title="Couldn't load guardian access settings"
      message="We couldn't load guardian access settings. Please try again."
      homePath="/baseball/dashboard/settings"
    />
  );
}
