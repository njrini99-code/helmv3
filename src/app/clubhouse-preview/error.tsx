'use client';

import { ClubhouseRouteError } from '@/clubhouse/shell/ClubhouseRouteError';

/** The preview's route error: Clubhouse's own, with one budgeted reload on a stale chunk (P007 D3). */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ClubhouseRouteError error={error} reset={reset} route="/clubhouse-preview" homePath="/clubhouse-preview/home" />;
}
