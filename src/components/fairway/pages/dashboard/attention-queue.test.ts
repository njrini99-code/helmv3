/**
 * ============================================================================
 * attention-queue — canonical coach "needs you" count (audit: one story)
 * ----------------------------------------------------------------------------
 * The deepest dashboard finding was that the hero, the approvals banner and the
 * Action Items panel each told a different story about what needs the coach:
 *   · hero counted actionItems.length (tasks + announcements) and its copy
 *     claimed "approvals" it never counted;
 *   · pending join-request approvals were counted by nothing;
 *   · announcements (no accept/resolve step) inflated the "waiting on you" total.
 * These tests pin the one honest rule: total = actionable tasks + approvals,
 * announcements always excluded, and a breakdown string that only ever names
 * the parts that are actually present.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';

import {
  buildCoachAttentionCounts,
  splitActionItems,
  attentionBreakdown,
} from './attention-queue';
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

describe('buildCoachAttentionCounts', () => {
  it('total = actionable tasks + approvals; announcements excluded from total', () => {
    const items = [task('a'), task('b', true), announcement('c')];
    const counts = buildCoachAttentionCounts(items, 2);
    expect(counts).toEqual({ tasks: 2, approvals: 2, announcements: 1, total: 4 });
  });

  it('announcements NEVER inflate the "needs you" total (the old bug)', () => {
    const items = [announcement('a'), announcement('b'), announcement('c')];
    const counts = buildCoachAttentionCounts(items, 0);
    expect(counts.total).toBe(0);
    expect(counts.announcements).toBe(3);
  });

  it('counts approvals even when there are no tasks', () => {
    expect(buildCoachAttentionCounts([], 3)).toEqual({
      tasks: 0,
      approvals: 3,
      announcements: 0,
      total: 3,
    });
  });

  it('clamps a negative / non-integer approvals count to a safe zero-floor', () => {
    expect(buildCoachAttentionCounts([task('a')], -5).approvals).toBe(0);
    expect(buildCoachAttentionCounts([task('a')], 2.9).approvals).toBe(2);
  });
});

describe('attentionBreakdown', () => {
  it('names both parts when both are present', () => {
    expect(attentionBreakdown({ tasks: 3, approvals: 2, announcements: 0, total: 5 })).toBe(
      '3 tasks and 2 approvals',
    );
  });

  it('singularizes correctly', () => {
    expect(attentionBreakdown({ tasks: 1, approvals: 1, announcements: 0, total: 2 })).toBe(
      '1 task and 1 approval',
    );
  });

  it('names only the non-zero part, so the copy is never a lie', () => {
    expect(attentionBreakdown({ tasks: 4, approvals: 0, announcements: 0, total: 4 })).toBe(
      '4 tasks',
    );
    expect(attentionBreakdown({ tasks: 0, approvals: 2, announcements: 0, total: 2 })).toBe(
      '2 approvals',
    );
  });

  it('is empty when nothing needs the coach', () => {
    expect(attentionBreakdown({ tasks: 0, approvals: 0, announcements: 3, total: 0 })).toBe('');
  });
});
