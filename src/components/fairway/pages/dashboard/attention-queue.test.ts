/**
 * ============================================================================
 * attention-queue — actionable vs. informational item split
 * ----------------------------------------------------------------------------
 * Pins `splitActionItems`, the one export from attention-queue.ts with a live
 * caller (FairwayCoachDashboard's ActionItemsPanel): tasks/deadlines route to
 * the actionable queue, announcements (no accept/resolve step) route to their
 * own informational strip and must never leak into the actionable list.
 *
 * `buildCoachAttentionCounts` / `attentionBreakdown` were deleted 2026-07-22
 * along with coach-signal.ts (the "N items need you" hero they fed) — that
 * hero's removal was intentional product direction, and neither function had
 * a caller left besides its own test once it was gone.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';

import { splitActionItems } from './attention-queue';
import type { ActionItem } from '@/app/golf/actions/dashboard-data';

const task = (id: string, over = false): ActionItem => ({
  id,
  type: over ? 'deadline' : 'task',
  title: `Task ${id}`,
  date: '2026-07-01',
  overdue: over,
});
const announcement = (id: string): ActionItem => ({
  id,
  type: 'announcement',
  title: `Announcement ${id}`,
  date: '2026-07-01',
});

describe('splitActionItems', () => {
  it('routes tasks and deadlines to actionable, announcements aside, preserving order', () => {
    const items = [task('a'), announcement('b'), task('c', true), announcement('d')];
    const { actionable, announcements } = splitActionItems(items);
    expect(actionable.map((i) => i.id)).toEqual(['a', 'c']);
    expect(announcements.map((i) => i.id)).toEqual(['b', 'd']);
  });

  it('handles an empty list', () => {
    expect(splitActionItems([])).toEqual({ actionable: [], announcements: [] });
  });
});
