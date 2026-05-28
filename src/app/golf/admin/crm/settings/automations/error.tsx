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
      route="/golf/admin/crm/settings/automations"
      component="CRMAutomationsPage"
      title="Failed to load CRM automations"
      message="We couldn't load CRM automations. Please try again."
      homePath="/golf/admin/crm"
    />
  );
}
