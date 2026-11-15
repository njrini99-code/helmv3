import { ClubhouseNotFound } from '@/clubhouse/shell/NotFound';

/**
 * Golf dashboard-scoped 404 (P431, CH-1306).
 *
 * Catches `notFound()` thrown by invalid dynamic IDs under the dashboard (rounds/[id], qualifiers/[id], a deleted
 * player or round), and any unmatched `/golf/dashboard/*` URL through the `[...missing]` catch-all (DASH-13).
 * Rendered INSIDE the (dashboard) layout, so it keeps the Clubhouse shell and nav rather than falling through to the
 * bare cross-product root not-found.tsx (which sits outside the shell and offers a "Baseball Dashboard" button).
 */
export default function GolfDashboardNotFound() {
  return <ClubhouseNotFound />;
}
