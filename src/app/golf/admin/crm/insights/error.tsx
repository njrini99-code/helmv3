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
      route="/golf/admin/crm/insights"
      component="CRMInsightsPage"
      title="Failed to load CRM insights"
      message="We couldn't load CRM insights. Please try again."
      homePath="/golf/admin/crm"
    />
  );
}
