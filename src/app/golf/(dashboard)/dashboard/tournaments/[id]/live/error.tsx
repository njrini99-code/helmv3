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
      route="/golf/dashboard/tournaments/[id]/live"
      component="TournamentLivePage"
      title="Tournaments didn’t load"
      message="Nothing is lost. Your events and scores are still saved; try again in a moment."
      homePath="/golf/dashboard"
    />
  );
}
