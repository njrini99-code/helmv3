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
      route="/golf/admin/crm/coach/[id]"
      component="CRMCoachDetailPage"
      title="Failed to load coach"
      message="We couldn't load this coach record. Please try again."
      homePath="/golf/admin/crm"
    />
  );
}
