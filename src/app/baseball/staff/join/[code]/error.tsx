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
      route="/baseball/staff/join/[code]"
      component="StaffJoinPage"
      title="Failed to load invitation"
      message="We couldn't load this staff invitation. The link may have expired."
      homePath="/baseball/dashboard"
    />
  );
}
