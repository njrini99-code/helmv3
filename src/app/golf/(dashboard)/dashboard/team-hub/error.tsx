'use client';

import { RouteErrorBoundary } from '@/components/errors';

/**
 * P361 / P432 — team-hub was the only dashboard route missing an error.tsx, so a
 * throw from its 6 parallel Supabase queries (page.tsx Promise.all, no try/catch)
 * bubbled to the distant (dashboard)/error.tsx and lost the Team-Hub-specific
 * recovery copy + reset. Mirror team/error.tsx so a query failure shows a
 * designed, retry-capable boundary instead of a generic one.
 */
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
      route="/golf/dashboard/team-hub"
      component="TeamHubPage"
      title="Failed to load Team Hub"
      message="We couldn't load your tasks, announcements, travel, and classes. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
