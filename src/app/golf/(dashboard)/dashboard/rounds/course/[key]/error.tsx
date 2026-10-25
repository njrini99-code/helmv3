'use client';

import { ClubhouseRouteError } from '@/clubhouse/shell/ClubhouseRouteError';

/** P-7: the course page is Clubhouse only, so its route error is Clubhouse's, like its loading fallback. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ClubhouseRouteError error={error} reset={reset} route="/golf/dashboard/rounds/course/[key]" homePath="/golf/dashboard/rounds" />;
}
