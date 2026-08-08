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
      route="/golf/admin/crm"
      component="GolfAdminCRMPage"
      title="Failed to load CRM"
      message="We couldn't load the CRM. Please try again."
      homePath="/admin"
    />
  );
}
