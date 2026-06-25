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
      route="/baseball/dashboard/settings/integrations"
      component="BaseballIntegrationsPage"
      title="Couldn't load integrations"
      message="We couldn't load your integrations. You may not have access, or there was a problem. Please try again."
      homePath="/baseball/dashboard/settings"
    />
  );
}
