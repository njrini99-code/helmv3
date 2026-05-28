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
      route="/baseball/forgot-password"
      component="BaseballForgotPasswordPage"
      title="Password reset error"
      message="We couldn't load the password reset page. Please try again."
      homePath="/baseball/login"
    />
  );
}
