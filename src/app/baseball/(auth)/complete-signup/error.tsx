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
      route="/baseball/complete-signup"
      component="BaseballCompleteSignupPage"
      title="Sign-up error"
      message="We couldn't complete your sign-up. Please try again."
      homePath="/baseball"
    />
  );
}
