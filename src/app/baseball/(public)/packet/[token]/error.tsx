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
      route="/baseball/packet/[token]"
      component="PublicScoutPacket"
      title="We couldn't load this packet"
      message="Something went wrong loading this scout packet. The link may be temporarily unavailable — please try again."
      // This is a public, unauthenticated share-link surface — "Go Home" must
      // not send anonymous visitors to /baseball/dashboard (an authenticated
      // route that immediately bounces them to /login). /baseball role-routes
      // signed-in users and sends everyone else to login, so it's the correct
      // recovery target for both audiences.
      homePath="/baseball"
    />
  );
}
