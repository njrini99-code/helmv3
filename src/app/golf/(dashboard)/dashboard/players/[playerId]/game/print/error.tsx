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
      homePath="/golf/dashboard/roster"
    />
  );
}
