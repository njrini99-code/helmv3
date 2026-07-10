// =============================================================================
// src/app/baseball/actions/__tests__/decision-log-column-reconcile.test.ts
//
// Regression test for the bb-performance-liftlab P0 finding: every Decision
// Room ledger write (markMeetingItemDiscussed / reopenMeetingItem /
// resolveMeetingItem / recordDecisionNote) inserted into
// `baseball_decision_log` using a subject_table/subject_id/source_signal_id
// shape that doesn't exist on the live table — the live columns are
// `meeting_item_id` / `signal_id` (see
// 20260710031500_baseball_decision_log_kind_reconcile.sql for the paired
// CHECK-constraint widening this fix also depends on). Locks in that the
// insert payloads target the real columns and never resurrect the dead
// subject_table/subject_id/source_signal_id keys.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/baseball/with-baseball-action', () => ({
  withBaseballAction:
    (_name: string, _opts: unknown, fn: (ctx: unknown, ...a: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn({ user: { id: 'user-1' }, targetTeamId: 'team-1' }, ...args),
  BaseballUnauthorizedError: class BaseballUnauthorizedError extends Error {},
  BaseballNoActiveTeamError: class BaseballNoActiveTeamError extends Error {},
  BaseballActionError: class BaseballActionError extends Error {},
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const insertCalls: Record<string, unknown[]> = { baseball_decision_log: [] };

function chainTable(table: string) {
  if (table === 'baseball_meeting_items') {
    return {
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      })),
    };
  }
  if (table === 'baseball_decision_log') {
    return {
      insert: vi.fn((payload: unknown) => {
        insertCalls.baseball_decision_log!.push(payload);
        return Promise.resolve({ error: null });
      }),
    };
  }
  throw new Error(`Unexpected table in test: ${table}`);
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => chainTable(table)),
  })),
}));

import { markMeetingItemDiscussed, recordDecisionNote } from '@/app/baseball/actions/decision-room';

beforeEach(() => {
  insertCalls.baseball_decision_log = [];
});

describe('markMeetingItemDiscussed', () => {
  it('inserts the ledger row keyed on meeting_item_id, never subject_table/subject_id', async () => {
    const result = await markMeetingItemDiscussed('item-1');

    expect(result).toEqual({ success: true });
    expect(insertCalls.baseball_decision_log).toHaveLength(1);
    const payload = insertCalls.baseball_decision_log![0] as Record<string, unknown>;
    expect(payload.meeting_item_id).toBe('item-1');
    expect(payload).not.toHaveProperty('subject_table');
    expect(payload).not.toHaveProperty('subject_id');
  });
});

describe('recordDecisionNote', () => {
  it('maps a meeting-item subject onto meeting_item_id (signal_id from sourceSignalId)', async () => {
    const result = await recordDecisionNote({
      title: 'Decision: Foo',
      note: 'Discussed with staff.',
      subjectTable: 'baseball_meeting_items',
      subjectId: 'item-2',
      sourceSignalId: 'signal-9',
      playerId: null,
    });

    expect(result).toEqual({ success: true });
    const payload = insertCalls.baseball_decision_log![0] as Record<string, unknown>;
    expect(payload.meeting_item_id).toBe('item-2');
    expect(payload.signal_id).toBe('signal-9');
    expect(payload).not.toHaveProperty('subject_table');
    expect(payload).not.toHaveProperty('subject_id');
    expect(payload).not.toHaveProperty('source_signal_id');
  });

  it('maps a signal subject onto signal_id with no meeting_item_id', async () => {
    const result = await recordDecisionNote({
      title: 'Decision: Bar',
      note: 'Raised without a meeting item.',
      subjectTable: 'baseball_signals',
      subjectId: 'signal-4',
      sourceSignalId: null,
      playerId: null,
    });

    expect(result).toEqual({ success: true });
    const payload = insertCalls.baseball_decision_log![0] as Record<string, unknown>;
    expect(payload.signal_id).toBe('signal-4');
    expect(payload.meeting_item_id).toBeNull();
  });
});
