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
      route="/baseball/login"
      component="BaseballLoginPage"
      title="Login error"
      message="We couldn't load the sign-in page. Please try again."
      homePath="/baseball"
    />
  );
}
