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
      route="/baseball/dashboard/settings/appearance"
      component="AppearanceSettingsPage"
      title="Couldn't load appearance settings"
      message="We couldn't load appearance settings. Please try again."
      homePath="/baseball/dashboard/settings"
    />
  );
}
