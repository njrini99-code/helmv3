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
      route="/baseball/dashboard/settings/demo-mode"
      component="DemoModeSettingsPage"
      title="Couldn't load demo mode settings"
      message="We couldn't load demo mode settings. Please try again."
      homePath="/baseball/dashboard/settings"
    />
  );
}
