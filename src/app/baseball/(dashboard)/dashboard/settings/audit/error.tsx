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
      route="/baseball/dashboard/settings/audit"
      component="BaseballSettingsAuditPage"
      title="Couldn't load the audit log"
      message="We couldn't load the settings audit log. You may not have the manage-settings capability, or there was a problem. Please try again."
      homePath="/baseball/dashboard/settings"
    />
  );
}
