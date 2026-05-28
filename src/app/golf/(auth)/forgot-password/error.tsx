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
      route="/golf/forgot-password"
      component="GolfForgotPasswordPage"
      title="Password reset error"
      message="We couldn't load the password reset page. Please try again."
      homePath="/golf/login"
    />
  );
}
