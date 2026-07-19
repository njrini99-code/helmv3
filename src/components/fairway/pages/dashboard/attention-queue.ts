/**
 * ============================================================================
 * Fairway · Coach dashboard — canonical "needs you" attention model (PURE)
 * ----------------------------------------------------------------------------
 * ONE source of truth for "what needs the coach." Before this, the dashboard
 * told the coach three different stories: the hero counted `actionItems.length`
 * (tasks + announcements) and its copy claimed "approvals" it never counted;
 * the join-request approvals lived in a separate banner counted by nothing; and
 * announcements (which have no read/unread and require no action) inflated the
 * "waiting on you" number as if they were backlog.
 *
 * This module derives one honest count from data the dashboard ALREADY holds
 * (no new query, no I/O): the "needs you" total is actionable tasks + pending
 * approvals. Announcements are informational and counted separately, never as
 * backlog. Signals and Team Pulse keep their own, genuinely-different metrics
 * (analytical signals; roster trend) — this is only the operational "act on it"
 * queue, so the surfaces stop competing for the word "attention."
 * ========================================================================== */

import type { ActionItem } from '@/app/golf/actions/dashboard-data';

export interface AttentionCounts {
  /** Actionable tasks + overdue deadlines (an overdue task is a 'deadline'). */
  tasks: number;
  /** Pending roster join-request approvals. */
  approvals: number;
  /** Team announcements — informational, NEVER counted as "waiting on you." */
  announcements: number;
  /** The honest "needs you" total: actionable tasks + approvals. */
  total: number;
}

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

/** The canonical count. `pendingApprovals` is the number of pending roster
 *  join requests (already fetched for the approvals banner). */
export function buildCoachAttentionCounts(
  items: ReadonlyArray<ActionItem>,
  pendingApprovals: number,
): AttentionCounts {
  const { actionable, announcements } = splitActionItems(items);
  const approvals = Math.max(0, pendingApprovals | 0);
  return {
    tasks: actionable.length,
    approvals,
    announcements: announcements.length,
    total: actionable.length + approvals,
  };
}

/** Noun-phrase breakdown of the "needs you" total, e.g. "3 tasks and 2
 *  approvals" — only names the parts that are non-zero, so the copy is always
 *  true. Returns a bare fragment (no verb): the hero composes the sentence so
 *  the body never echoes the "N need you" verb already in the headline. */
export function attentionBreakdown(c: AttentionCounts): string {
  const parts: string[] = [];
  if (c.tasks > 0) parts.push(`${c.tasks} ${c.tasks === 1 ? 'task' : 'tasks'}`);
  if (c.approvals > 0)
    parts.push(`${c.approvals} ${c.approvals === 1 ? 'approval' : 'approvals'}`);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
