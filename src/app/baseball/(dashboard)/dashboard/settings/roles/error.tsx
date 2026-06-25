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
      route="/baseball/dashboard/settings/roles"
      component="RolesPage"
      title="Couldn't load role templates"
      message="We couldn't load the role templates for your program. Please try again."
      homePath="/baseball/dashboard/settings"
    />
  );
}
