'use client';

/**
 * Dashboard route template. Clubhouse owns the route transition (src/clubhouse/shell/RouteFrame.tsx); the template
 * stays so each navigation remounts its segment, as it always has.
 */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
