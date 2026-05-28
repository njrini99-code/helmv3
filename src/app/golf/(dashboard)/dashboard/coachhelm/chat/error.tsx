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
      route="/golf/dashboard/coachhelm/chat"
      component="CoachHelmChatPage"
      title="Failed to load chat"
      message="We couldn't load CoachHelm chat. Please try again."
      homePath="/golf/dashboard/coachhelm"
    />
  );
}
