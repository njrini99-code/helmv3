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
      route="/baseball/dashboard/settings"
      component="BaseballSettingsPage"
      title="Failed to load settings"
      message="We couldn't load settings. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
