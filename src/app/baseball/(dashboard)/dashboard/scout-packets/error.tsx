'use client';

import { RouteErrorBoundary } from '@/components/errors';

export default function ScoutPacketsError({
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
      route="/baseball/dashboard/scout-packets"
      component="ScoutPacketsPage"
      title="Scout Packets couldn't load"
      message="We couldn't load the Scout Packets hub. Please try again."
      homePath="/baseball/dashboard/command-center"
    />
  );
}
