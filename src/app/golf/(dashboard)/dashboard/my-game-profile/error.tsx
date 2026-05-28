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
      route="/golf/dashboard/my-game-profile"
      component="MyGameProfilePage"
      title="Failed to load game profile"
      message="We couldn't load your game profile. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
