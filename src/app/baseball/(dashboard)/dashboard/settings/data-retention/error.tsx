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
      route="/baseball/dashboard/settings/data-retention"
      component="DataRetentionSettingsPage"
      title="Couldn't load data retention settings"
      message="We couldn't load data retention settings. Please try again."
      homePath="/baseball/dashboard/settings"
    />
  );
}
