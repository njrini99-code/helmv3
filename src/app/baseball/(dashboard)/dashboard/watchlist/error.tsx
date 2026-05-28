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
      route="/baseball/dashboard/watchlist"
      component="WatchlistPage"
      title="Failed to load watchlist"
      message="We couldn't load your watchlist. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
