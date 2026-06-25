'use client';

import { RouteErrorBoundary } from '@/components/errors';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorBoundary
      error={error}
      reset={reset}
      route="/baseball/dashboard/performance/groups"
      component="BaseballStrengthGroups"
      title="Strength groups error"
      message="We couldn't load the group builder. Please try again."
      homePath="/baseball/dashboard/performance"
    />
  );
}
