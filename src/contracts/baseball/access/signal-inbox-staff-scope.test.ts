// =============================================================================
// src/contracts/baseball/access/signal-inbox-staff-scope.test.ts
//
// PRODUCT TRUTH THIS FILE PINS (#377 — Signal Inbox is STAFF-ONLY):
//   1. The Signal Inbox is a coaching surface: a caller who is not staff on
//      the REQUESTED team (no user session, no baseball_coaches row, or a
//      baseball_team_coach_staff row on a DIFFERENT team) gets
//      `authorized:false` with the fully-empty envelope — never partial or
//      leaked signal data.
//   2. A staff member authorized on the requested team sees ONLY that team's
//      signals — a signal that belongs to a different team_id never leaks
//      into the feed, even when both teams' signals exist in the same table.
//
// Source of truth: `isTeamStaff` (staff gate) + the `.eq('team_id', teamId)`
// signal query in src/lib/baseball/read-models/signal-inbox.ts.
// =============================================================================

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

import { getSignalInbox } from '@/lib/baseball/read-models/signal-inbox';

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';
const COACH_ID = 'coach-1';
const USER_ID = 'user-1';

type Row = Record<string, unknown>;

function signalRow(id: string, teamId: string): Row {
  return {
    id,
    team_id: teamId,
    player_id: null,
    event_id: null,
    signal_type: 'roster_gap',
    category: 'roster',
    severity: 'info',
    title: `Signal for ${teamId}`,
    why_it_matters: null,
    evidence: null,
    source_refs: [],
    confidence: null,
    sample_n: null,
    recommended_action_label: null,
    recommended_action_type: 'none',
    recommended_owner_role: null,
    owner_coach_id: null,
    disposition: 'new',
    visibility: 'team',
    generated_by: 'coachhelm-engine',
    source_kind: 'system',
    feedback: null,
    dedupe_key: `roster_gap:${teamId}`,
    acknowledged_by: null,
    acknowledged_at: null,
    resolved_at: null,
    expires_at: null,
    created_by: null,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  fake = createFakeSupabase({ user: { id: USER_ID } });
});

describe('getSignalInbox — staff-only authorization envelope (#377)', () => {
  it('an unauthenticated caller gets authorized:false and zero signals', async () => {
    fake = createFakeSupabase({ user: null, tables: {} });
    const result = await getSignalInbox(TEAM_A);
    expect(result.authorized).toBe(false);
    expect(result.signals).toEqual([]);
    expect(result.error).toBeNull();
  });

  it('a user with no baseball_coaches row gets authorized:false', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: {
        baseball_coaches: [],
        baseball_signals: [signalRow('sig-a', TEAM_A)],
      },
    });
    const result = await getSignalInbox(TEAM_A);
    expect(result.authorized).toBe(false);
    expect(result.signals).toEqual([]);
  });

  it('a coach who is staff on a DIFFERENT team (not the requested one) gets authorized:false and zero rows', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: {
        baseball_coaches: [{ id: COACH_ID, user_id: USER_ID }],
        // Staff on TEAM_B only — the request below asks for TEAM_A.
        baseball_team_coach_staff: [{ id: 'staff-1', team_id: TEAM_B, coach_id: COACH_ID }],
        baseball_signals: [signalRow('sig-a', TEAM_A)],
      },
    });
    const result = await getSignalInbox(TEAM_A);
    expect(result.authorized).toBe(false);
    expect(result.signals).toEqual([]);
  });

  it('an authorized staff member on the requested team gets authorized:true', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: {
        baseball_coaches: [{ id: COACH_ID, user_id: USER_ID }],
        baseball_team_coach_staff: [{ id: 'staff-1', team_id: TEAM_A, coach_id: COACH_ID }],
        baseball_signals: [],
        baseball_actions: [],
        baseball_team_members: [],
      },
    });
    const result = await getSignalInbox(TEAM_A);
    expect(result.authorized).toBe(true);
  });
});

describe('getSignalInbox — cross-team signal isolation (#377)', () => {
  it("an authorized staff member on TEAM_A sees ONLY TEAM_A's signals, never TEAM_B's", async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: {
        baseball_coaches: [{ id: COACH_ID, user_id: USER_ID }],
        baseball_team_coach_staff: [{ id: 'staff-1', team_id: TEAM_A, coach_id: COACH_ID }],
        baseball_signals: [signalRow('sig-a', TEAM_A), signalRow('sig-b', TEAM_B)],
        baseball_actions: [],
        baseball_team_members: [],
      },
    });

    const result = await getSignalInbox(TEAM_A);
    expect(result.authorized).toBe(true);
    const ids = result.signals.map((s) => s.id);
    expect(ids).toEqual(['sig-a']);
    expect(ids).not.toContain('sig-b');
  });
});
