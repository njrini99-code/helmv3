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
      route="/golf/admin/crm/inbox"
      component="CRMInboxPage"
      title="Failed to load CRM inbox"
      message="We couldn't load the CRM inbox. Please try again."
      homePath="/golf/admin/crm"
    />
  );
}
