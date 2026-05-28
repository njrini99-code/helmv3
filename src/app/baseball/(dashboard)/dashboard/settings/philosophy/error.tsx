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
      route="/baseball/dashboard/settings/philosophy"
      component="PhilosophySettingsPage"
      title="Failed to load philosophy settings"
      message="We couldn't load philosophy settings. Please try again."
      homePath="/baseball/dashboard/settings"
    />
  );
}
