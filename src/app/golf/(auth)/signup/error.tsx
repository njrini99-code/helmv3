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
      route="/golf/signup"
      component="GolfSignupPage"
      title="Sign-up error"
      message="We couldn't load the sign-up page. Please try again."
      homePath="/golf"
    />
  );
}
