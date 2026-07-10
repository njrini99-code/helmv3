'use server';

// =============================================================================
// src/app/baseball/actions/practice-planner-capability.ts
//
// Packet: bb-practice-game (feature-flow sweep, 2026-07-10)
//
// Practice Planner's write actions (savePractice, publishPractice,
// recordPracticeAttendance, saveObjective, savePracticeRecap, assignRecapTask,
// saveScrimmage, publishScrimmage, convertSignalToBlock) all correctly enforce
// can_manage_practice server-side (withBaseballAction). Nothing previously told
// the CLIENT whether the current coach actually holds it, so a capability-
// lacking staffer (e.g. a Strength Coach / Recruiting Coordinator preset,
// neither of which grants can_manage_practice) saw the full interactive editor,
// could build an entire plan, and only discovered every save silently failed
// after the fact — with the in-progress work lost on refresh.
//
// This is a read-only capability probe so PracticePlannerClient can render an
// honest read-only state UP FRONT instead. It changes no data and enforces
// nothing itself — the write actions remain the real security boundary.
// =============================================================================

import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { hasBaseballCapability } from '@/lib/baseball/capabilities';

/**
 * Whether the current authenticated user is coaching staff on their active
 * team AND holds can_manage_practice. False for players or staff without the
 * capability; unauthenticated/contextless calls reject via the wrapper (the
 * caller's .catch treats that as false). Wrapped for Helm Bridge
 * observability like every other baseball server action (coverage contract).
 */
export const getCanManagePractice = withBaseballAction(
  'getCanManagePractice',
  { feature: 'baseball_practice', featureArea: 'baseball-practice' },
  async (ctx): Promise<boolean> => {
    if (ctx.activeRole !== 'coach') return false;
    return hasBaseballCapability(ctx.activeTeamId, 'can_manage_practice');
  },
);
