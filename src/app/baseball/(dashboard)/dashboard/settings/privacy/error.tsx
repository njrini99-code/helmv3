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
      route="/baseball/dashboard/settings/privacy"
      component="PrivacySettingsPage"
      title="Failed to load privacy settings"
      message="We couldn't load privacy settings. Please try again."
      homePath="/baseball/dashboard/settings"
    />
  );
}
