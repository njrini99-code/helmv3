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
      homePath="/baseball/dashboard"
    />
  );
}
