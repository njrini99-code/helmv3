'use client';

import { RouteErrorBoundary } from '@/components/errors';

/** Inside Clubhouse the boundary logs to Sentry and draws Clubhouse's own view (FID-PRAC-25). */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorBoundary error={error} reset={reset} route="/golf/dashboard/practice/groups" />;
}
