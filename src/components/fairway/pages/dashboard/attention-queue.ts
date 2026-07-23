/**
 * ============================================================================
 * attention-queue — actionable vs. informational item split (PURE)
 * ----------------------------------------------------------------------------
 * Splits the dashboard's raw action-item feed into the ACTIONABLE queue (tasks
 * + deadlines — what ActionItemsPanel's header badge counts and renders) and
 * the informational Announcements strip (no accept/resolve step, so it must
 * never inflate the "waiting on you" count).
 *
 * This module used to also derive a canonical "needs you" total (actionable
 * tasks + pending roster-join approvals) via `buildCoachAttentionCounts` +
 * `attentionBreakdown`, feeding the coach dashboard's "N items need you" hero
 * (coach-signal.ts's `deriveCoachSignal`). That hero was removed from
 * FairwayCoachDashboard as intentional product direction; both functions were
 * deleted alongside coach-signal.ts (2026-07-22) rather than left as dead
 * exports with no caller but their own test. `splitActionItems` is the one
 * piece of the original model with a live caller (ActionItemsPanel) — it
 * stays.
 * ========================================================================== */

import type { ActionItem } from '@/app/golf/actions/dashboard-data';

/** Split the raw dashboard action items into the actionable queue (tasks +
 *  deadlines) and the informational announcements strip. Order is preserved
 *  from the upstream builder (tasks are already due-date sorted). */
export function splitActionItems(items: ReadonlyArray<ActionItem>): {
  actionable: ActionItem[];
  announcements: ActionItem[];
} {
  const actionable: ActionItem[] = [];
  const announcements: ActionItem[] = [];
  for (const it of items) {
    if (it.type === 'announcement') announcements.push(it);
    else actionable.push(it); // 'task' | 'deadline'
  }
  return { actionable, announcements };
}
