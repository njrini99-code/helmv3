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
      route="/baseball/program/[id]"
      component="PublicProgramProfile"
      title="Failed to load program profile"
      message="We couldn't load this program's profile. The program may not exist or there might be a connection issue."
      // This is a public, unauthenticated share-link surface — "Go Home" must
      // not send anonymous visitors to /baseball/dashboard (an authenticated
      // route that immediately bounces them to /login). /baseball role-routes
      // signed-in users and sends everyone else to login, so it's the correct
      // recovery target for both audiences.
      homePath="/baseball"
    />
  );
}
