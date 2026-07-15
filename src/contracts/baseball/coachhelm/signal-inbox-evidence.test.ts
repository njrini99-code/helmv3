// =============================================================================
// src/contracts/baseball/coachhelm/signal-inbox-evidence.test.ts
//
// PRODUCT TRUTH THIS FILE PINS (#377 — Signal Inbox READ MODEL honesty):
//   Distinct from src/contracts/baseball/coachhelm/signal-evidence.test.ts,
//   which pins `signalFromInsight`'s PROMOTION gate (which insights become a
//   signal row at all). This file pins `getSignalInbox` itself — the read
//   model that shapes ALREADY-PERSISTED `baseball_signals` rows for the
//   triage UI:
//     1. `sampleTooSmall` is derived from disposition OR a sub-threshold
//        `sample_n` — a signal a generator forgot to flag (disposition
//        left 'new') is STILL caught by the sample_n floor. It is never
//        rendered as authoritative just because a field was left unset.
//     2. `confidence` is never fabricated: null stays null (renders "—");
//        a legacy 0-100-scale value is honestly normalized to [0,1], never
//        silently passed through raw.
//     3. `sourceRefs` on the row are the REAL persisted refs — an empty
//        `source_refs` array is never backfilled with a fabricated
//        placeholder citation.
//     4. Sub-read failures (the signals query itself, or the actions-join
//        query) degrade to a distinguishable, non-null `error` string —
//        never conflated with "authorized, and there is genuinely nothing".
//
// Source of truth: `getSignalInbox` in
// src/lib/baseball/read-models/signal-inbox.ts.
// =============================================================================

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';
import { failSelect } from '@/test/fixtures/fake-supabase-fail-select';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

import { getSignalInbox } from '@/lib/baseball/read-models/signal-inbox';

const TEAM_ID = 'team-1';
const COACH_ID = 'coach-1';
const USER_ID = 'user-1';

type Row = Record<string, unknown>;

function signalFixture(overrides: Row = {}): Row {
  return {
    id: 'sig-1',
    team_id: TEAM_ID,
    player_id: 'p1',
    event_id: null,
    signal_type: 'two_strike_chase',
    category: 'hitting',
    severity: 'warning',
    title: 'Two-strike chase rate is elevated',
    why_it_matters: 'Chasing more than the team average.',
    evidence: '38% chase rate over 12 at-bats.',
    source_refs: [
      { source_table: 'baseball_box_score_batting', column: 'k', sample_n: 12, label: 'Last 12 at-bats' },
    ],
    confidence: 0.8,
    sample_n: 12,
    recommended_action_label: 'Add a two-strike drill',
    recommended_action_type: 'practice_block',
    recommended_owner_role: 'hitting_coach',
    owner_coach_id: null,
    disposition: 'new',
    visibility: 'team',
    generated_by: 'coachhelm-engine',
    source_kind: 'ai',
    feedback: null,
    dedupe_key: 'two_strike_chase:p1',
    acknowledged_by: null,
    acknowledged_at: null,
    resolved_at: null,
    expires_at: null,
    created_by: null,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

function baseTables(extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    baseball_coaches: [{ id: COACH_ID, user_id: USER_ID }],
    baseball_team_coach_staff: [{ id: 'staff-1', team_id: TEAM_ID, coach_id: COACH_ID }],
    baseball_actions: [],
    baseball_team_members: [],
    baseball_signals: [],
    ...extra,
  };
}

beforeEach(() => {
  fake = createFakeSupabase({ user: { id: USER_ID }, tables: baseTables() });
});

describe('getSignalInbox — sampleTooSmall is never silently authoritative (#377)', () => {
  it('a sub-threshold sample_n is caught EVEN when disposition was left "new" (generator forgot to flag it)', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: baseTables({
        baseball_signals: [signalFixture({ disposition: 'new', sample_n: 5 })],
      }),
    });

    const result = await getSignalInbox(TEAM_ID);
    expect(result.authorized).toBe(true);
    const row = result.signals.find((s) => s.id === 'sig-1');
    expect(row?.sampleTooSmall).toBe(true);
  });

  it('a sample_n at/above the floor with disposition "new" is NOT flagged sample-too-small', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: baseTables({
        baseball_signals: [signalFixture({ disposition: 'new', sample_n: 6 })],
      }),
    });

    const result = await getSignalInbox(TEAM_ID);
    const row = result.signals.find((s) => s.id === 'sig-1');
    expect(row?.sampleTooSmall).toBe(false);
  });

  it('disposition "sample_too_small" is honored regardless of a healthy-looking sample_n', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: baseTables({
        baseball_signals: [signalFixture({ disposition: 'sample_too_small', sample_n: 500 })],
      }),
    });

    const result = await getSignalInbox(TEAM_ID);
    const row = result.signals.find((s) => s.id === 'sig-1');
    expect(row?.sampleTooSmall).toBe(true);
  });
});

describe('getSignalInbox — confidence is never fabricated (#377)', () => {
  it('a null confidence stays null (renders "—"), never coerced to 0', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: baseTables({ baseball_signals: [signalFixture({ confidence: null })] }),
    });

    const result = await getSignalInbox(TEAM_ID);
    const row = result.signals.find((s) => s.id === 'sig-1');
    expect(row?.confidence).toBeNull();
  });

  it('a legacy 0-100-scale confidence is honestly normalized to [0,1], never passed through raw', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: baseTables({ baseball_signals: [signalFixture({ confidence: 85 })] }),
    });

    const result = await getSignalInbox(TEAM_ID);
    const row = result.signals.find((s) => s.id === 'sig-1');
    expect(row?.confidence).toBeCloseTo(0.85, 5);
  });
});

describe('getSignalInbox — evidence citation on the shaped row (#377)', () => {
  it('sourceRefs reflects the REAL persisted source_refs, not a placeholder', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: baseTables({ baseball_signals: [signalFixture()] }),
    });

    const result = await getSignalInbox(TEAM_ID);
    const row = result.signals.find((s) => s.id === 'sig-1');
    expect(row?.sourceRefs).toHaveLength(1);
    expect(row?.sourceRefs[0]?.source_table).toBe('baseball_box_score_batting');
  });

  it('an empty source_refs array stays empty — never backfilled with a fabricated citation', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: baseTables({ baseball_signals: [signalFixture({ source_refs: [] })] }),
    });

    const result = await getSignalInbox(TEAM_ID);
    const row = result.signals.find((s) => s.id === 'sig-1');
    expect(row?.sourceRefs).toEqual([]);
  });
});

describe('getSignalInbox — sub-read failures are distinguishable from genuine emptiness (#377)', () => {
  it('zero signals + zero actions (genuinely empty): authorized:true, signals:[], error:null', async () => {
    const result = await getSignalInbox(TEAM_ID);
    expect(result.authorized).toBe(true);
    expect(result.signals).toEqual([]);
    expect(result.error).toBeNull();
  });

  it('a FAILING signals query: authorized:true, signals:[] — but `error` distinguishes it from genuine emptiness', async () => {
    failSelect(fake, 'baseball_signals', 'boom');

    const result = await getSignalInbox(TEAM_ID);
    expect(result.authorized).toBe(true);
    expect(result.signals).toEqual([]);
    expect(result.error).toBe('Signals could not be loaded.');
  });

  it('a FAILING actions-join query: signals still load, but a DIFFERENT `error` string is set', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: baseTables({ baseball_signals: [signalFixture()] }),
    });
    failSelect(fake, 'baseball_actions', 'boom');

    const result = await getSignalInbox(TEAM_ID);
    expect(result.authorized).toBe(true);
    // The signal itself still loaded (a converted-actions failure must not
    // blank out the whole inbox)...
    expect(result.signals).toHaveLength(1);
    // ...but the actions-join failure is surfaced, not silently swallowed.
    expect(result.error).toBe('Converted actions could not be loaded.');
  });
});
