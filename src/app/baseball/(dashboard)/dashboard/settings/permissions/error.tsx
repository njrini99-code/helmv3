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
      route="/baseball/dashboard/settings/permissions"
      component="PermissionsPage"
      title="Couldn't load permissions"
      message="We couldn't load the capability matrix. Please try again."
      homePath="/baseball/dashboard/settings"
    />
  );
}
