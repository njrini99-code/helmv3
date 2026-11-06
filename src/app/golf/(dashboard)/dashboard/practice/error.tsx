'use client';

import { useEffect } from 'react';
import { ClubhouseRouteError } from '@/clubhouse/shell/ClubhouseRouteError';
import { logError } from '@/lib/error-logging';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => logError(error, { route: '/golf/dashboard/practice', digest: error.digest, boundary: 'route' }), [error]);
  return <ClubhouseRouteError error={error} reset={reset} route="/golf/dashboard/practice" />;
}
