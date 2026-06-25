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
      route="/baseball/dashboard/settings/notifications"
      component="NotificationSettingsPage"
      title="Couldn't load notification settings"
      message="We couldn't load notification settings. Please try again."
      homePath="/baseball/dashboard/settings"
    />
  );
}
