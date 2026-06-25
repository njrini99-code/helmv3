'use client';

import { RouteErrorBoundary } from '@/components/errors';

export default function ScoutPacketPreviewError({
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
      route="/baseball/dashboard/players/[id]/scout-packet/preview"
      component="ScoutPacketPreviewPage"
      title="Preview couldn't load"
      message="We couldn't load the scout packet preview. Please try again."
      homePath="/baseball/dashboard/scout-packets"
    />
  );
}
