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
      route="/golf/admin/crm/settings/suppressions"
      component="CRMSuppressionsPage"
      title="Failed to load CRM suppressions"
      message="We couldn't load CRM suppressions. Please try again."
      homePath="/golf/admin/crm"
    />
  );
}
