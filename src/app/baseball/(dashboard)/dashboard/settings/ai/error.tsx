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
      route="/baseball/dashboard/settings/ai"
      component="AISettingsPage"
      title="Couldn't load AI settings"
      message="We couldn't load AI settings. Please try again."
      homePath="/baseball/dashboard/settings"
    />
  );
}
