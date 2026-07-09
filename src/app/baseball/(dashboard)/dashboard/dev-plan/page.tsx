// =============================================================================
// src/app/baseball/(dashboard)/dashboard/dev-plan/page.tsx
//
// COHERENCE_RULING_2026-07-08 Ruling 5 — "dev-plan cold-URL bounce" fix.
//
// Was fully client-rendered (own useAuth + getActiveDevPlan fetch cycle),
// which raced (dashboard)/layout.tsx's client-side DashboardSessionGuard on a
// hard/cold navigation straight to this URL: both the guard's auth/nav-context
// resolution and this page's own auth resolution ran as separate async client
// hooks with no ordering guarantee, occasionally producing a transient 500
// before the guard's redirect settled. Server-resolving the player session
// FIRST (requireBaseballPlayerRoute — redirects synchronously server-side,
// before any client hydration is even possible) removes the race outright.
// Matches the same guard-then-client-render pattern every other server page
// in this route group uses (e.g. my-stats/page.tsx, pipeline/page.tsx).
// =============================================================================

import { requireBaseballPlayerRoute } from '@/lib/baseball/server-route-guards';
import DevPlanClient from './DevPlanClient';

export default async function DevPlanPage() {
  await requireBaseballPlayerRoute();
  return <DevPlanClient />;
}
