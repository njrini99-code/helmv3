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
      route="/baseball/dashboard/settings/season"
      component="SeasonSettingsPage"
      title="Couldn't load season settings"
      message="We couldn't load your season settings. Please try again."
      homePath="/baseball/dashboard/settings"
    />
  );
}
