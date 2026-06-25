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
      route="/baseball/dashboard/settings/imports"
      component="BaseballImportSourcesPage"
      title="Couldn't load import sources"
      message="We couldn't load your import sources. You may not have the manage-imports capability, or there was a problem. Please try again."
      homePath="/baseball/dashboard/settings"
    />
  );
}
