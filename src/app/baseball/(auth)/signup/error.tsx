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
      route="/baseball/signup"
      component="BaseballSignupPage"
      title="Sign-up error"
      message="We couldn't load the sign-up page. Please try again."
      homePath="/baseball"
    />
  );
}
