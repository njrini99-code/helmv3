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
      route="/baseball/dashboard/settings/recruiting-preferences"
      component="RecruitingPreferencesPage"
      title="Failed to load recruiting preferences"
      message="We couldn't load recruiting preferences. Please try again."
      homePath="/baseball/dashboard/settings"
    />
  );
}
