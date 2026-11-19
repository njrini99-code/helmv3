'use client';

import { RouteErrorBoundary } from '@/components/errors';
import { GateError } from '@/clubhouse/screens/auth/GateError';

/** Inside Clubhouse the boundary logs to Sentry and draws Clubhouse's own view (FID-PRAC-25). */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorBoundary error={error} reset={reset} outsideShell={GateError} route="/golf/dashboard/practice/drills" homePath="/golf/dashboard/practice" />;
}
