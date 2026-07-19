/**
 * ============================================================================
 * coach-signal — honest hero count sourced from the canonical attention model
 * ----------------------------------------------------------------------------
 * Before the attention model, the hero counted actionItems.length (tasks +
 * announcements) and its body claimed "Tasks, approvals, and deadlines" while
 * approvals were counted by nothing. These tests pin the fix: when the canonical
 * AttentionCounts is passed, the hero number IS that total (tasks + approvals,
 * announcements excluded) and the body only names parts that truly exist.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';

import { deriveCoachSignal } from './coach-signal';
import type { AttentionCounts } from './attention-queue';
import type { CoachDashboardPayload } from '@/app/golf/actions/dashboard-data';

const counts = (c: Partial<AttentionCounts>): AttentionCounts => ({
  tasks: 0,
  approvals: 0,
  announcements: 0,
  total: 0,
  ...c,
});

// Minimal payload — the attention path only needs actionItems to exist; the
// canonical count is passed explicitly.
const payload = (actionItemCount: number): CoachDashboardPayload =>
  ({
    actionItems: Array.from({ length: actionItemCount }, (_, i) => ({
      id: `x${i}`,
      type: 'task',
      title: `t${i}`,
      date: '2026-07-01',
    })),
  }) as unknown as CoachDashboardPayload;

describe('deriveCoachSignal — attention-sourced hero', () => {
  it('hero total = tasks + approvals (approvals finally counted)', () => {
    const s = deriveCoachSignal(payload(3), 10, counts({ tasks: 3, approvals: 2, total: 5 }));
    expect(s.priority).toBe('high');
    expect(s.title).toBe('5 items need you');
    expect(s.body).toBe('3 tasks and 2 approvals flagged from your roster this week.');
    expect(s.insufficient).toBe(false);
  });

  it('announcements do NOT lift the hero into the high state', () => {
    // 2 announcements present, but zero actionable + zero approvals → total 0,
    // so the hero must fall THROUGH to a non-action signal, not claim work.
    const s = deriveCoachSignal(payload(2), 10, counts({ announcements: 2, total: 0 }));
    expect(s.title).not.toMatch(/need you/);
  });

  it('singular copy at exactly one item', () => {
    const s = deriveCoachSignal(payload(1), 10, counts({ tasks: 1, total: 1 }));
    expect(s.title).toBe('1 item needs you');
    expect(s.body).toBe('1 task flagged from your roster this week.');
  });

  it('never claims "approvals" when there are none', () => {
    const s = deriveCoachSignal(payload(2), 10, counts({ tasks: 2, total: 2 }));
    expect(s.body).toBe('2 tasks flagged from your roster this week.');
    expect(s.body).not.toMatch(/approval/);
  });

  it('legacy call (no attention) falls back to raw count and drops the approvals claim', () => {
    const s = deriveCoachSignal(payload(4), 10);
    expect(s.title).toBe('4 items need you');
    expect(s.body).toBe('Tasks and deadlines flagged from your roster this week.');
    expect(s.body).not.toMatch(/approval/);
  });
});
