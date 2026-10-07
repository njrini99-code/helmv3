import { notFound } from 'next/navigation';

/**
 * Catch-all for unmatched `/golf/dashboard/*` URLs (DASH-13). Without it a
 * mistyped or retired path falls through to the app-wide root 404, outside the
 * golf shell (and offering a Baseball button). Throwing here renders the
 * dashboard-scoped `not-found.tsx` inside the shell instead.
 */
export default function MissingDashboardRoute(): never {
  notFound();
}
