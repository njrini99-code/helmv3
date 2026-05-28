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
      route="/golf/admin/crm/sequences"
      component="CRMSequencesPage"
      title="Failed to load CRM sequences"
      message="We couldn't load CRM sequences. Please try again."
      homePath="/golf/admin/crm"
    />
  );
}
