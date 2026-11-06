'use client';

import { ClubhouseRouteError } from '@/clubhouse/shell/ClubhouseRouteError';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ClubhouseRouteError error={error} reset={reset} route="/golf/dashboard/practice/print/plan" />;
}
