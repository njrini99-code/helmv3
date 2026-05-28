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
      route="/golf/dashboard/players/[playerId]/game/print"
      component="PlayerGamePrintPage"
      title="Failed to load printable game profile"
      message="We couldn't load the printable game profile. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
