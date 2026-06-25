'use client';

// =============================================================================
// src/app/baseball/(dashboard)/dashboard/import/error.tsx
//
// Wave 6 / packet: source-registry. Route-group error boundary for the Import
// Center, tagged feature_area=import for triage.
// =============================================================================

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
      route="/baseball/dashboard/import"
      component="ImportCenterPage[feature_area=import]"
      title="Failed to load the Import Center"
      message="We couldn't load the Import Center. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
