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
      route="/baseball/dashboard/settings/showcase-profile"
      component="ShowcaseProfileSettingsPage"
      title="Couldn't load showcase profile settings"
      message="We couldn't load showcase profile settings. Please try again."
      homePath="/baseball/dashboard/settings"
    />
  );
}
