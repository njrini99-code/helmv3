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
      homePath="/baseball/dashboard"
    />
  );
}
