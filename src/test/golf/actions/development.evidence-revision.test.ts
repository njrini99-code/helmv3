/**
 * A8 slice 1 — the `coachhelm_focus_area_evidence_revision` flag gate on
 * `createFocusAreaFromInsightV2` / `createFocusAreaFromInsight`.
 *
 * Migration 20260923090000_golf_focus_area_evidence_revision adds
 * `golf_player_focus_areas.evidence_revision`, but is NOT applied in
 * production yet — the flag must stay off there until it is, and while off,
 * the insert payload must not carry an `evidence_revision` key AT ALL (not
 * `null`): a typed/live insert against a table that doesn't have the column
 * would otherwise fail outright. These tests assert the payload shape
 * itself (via the in-memory fake table's `inserted` capture), not just the
 * action's `{ success }` result.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ notifyDevPlanAssigned: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/coachhelm/v3/effectiveness/event-ledger', () => ({
  recordInsightAction: vi.fn().mockResolvedValue(undefined),
}));

const verifyPlayerAccessMock = vi.fn();
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: (...args: unknown[]) => verifyPlayerAccessMock(...args),
}));

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClientMock() }));

const createAdminClientMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClientMock() }));

const isFlagEnabledMock = vi.fn().mockReturnValue(false);
vi.mock('@/lib/flags', () => ({ isFlagEnabled: (...args: unknown[]) => isFlagEnabledMock(...args) }));

import { createFocusAreaFromInsightV2, createFocusAreaFromInsight } from '@/app/golf/actions/development';
import { computeInsightEvidenceRevision } from '@/lib/coachhelm/focus-areas/evidence-revision-source';

/** In-memory `golf_player_focus_areas` handle — no existing rows needed for
 *  these tests (the duplicate-guard read always finds nothing), only the
 *  insert payload capture matters here. */
function makeFocusAreaTable() {
  const inserted: Array<Record<string, unknown>> = [];
  const handler = {
    select: () => ({
      eq: () => ({
        eq: () => ({
          in: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        }),
      }),
    }),
    insert: (payload: Record<string, unknown>) => {
      inserted.push(payload);
      const id = `new-fa-${inserted.length}`;
      return {
        select: () => ({ single: async () => ({ data: { id }, error: null }) }),
        then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
      };
    },
  };
  return { handler, inserted };
}

function emptyTable() {
  return { select: () => ({}), insert: () => ({}) };
}

const WELL_FORMED_INSIGHT_ROW = {
  lifecycle_state: 'detected',
  evidence: {
    confidence: 0.72,
    your_value: 3.1,
    comparison_value: 2.4,
    secondary_value: 1.9,
    sample_n: 42,
    window_days: 30,
    window_start: '2026-08-24T00:00:00.000Z',
    window_end: '2026-09-23T00:00:00.000Z',
  },
  engine_version: 'v3.4.1',
};

const MALFORMED_INSIGHT_ROW = {
  lifecycle_state: 'detected',
  evidence: null,
  engine_version: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  isFlagEnabledMock.mockReturnValue(false);
});

describe('createFocusAreaFromInsightV2 — evidence-revision flag gate', () => {
  function harness(fa: ReturnType<typeof makeFocusAreaTable>, insightRow: Record<string, unknown> | null) {
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'golf_team_members') {
          return { select: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { team_id: 'team-1' }, error: null }) }) }) }) }) };
        }
        if (table === 'golf_team_coach_staff') {
          return { select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { coach_id: 'coach-1' }, error: null }) }) }) }) };
        }
        if (table === 'golf_coach_insights') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: insightRow, error: null }) }) }) };
        }
        return emptyTable();
      },
    });
    createAdminClientMock.mockReturnValue({
      // resolveEvidenceRevisionForInsight reads through `writeClient`, which
      // for a self-promote ('self' reason) IS the admin client — the real
      // read happens here, not on the scoped client above.
      from: (table: string) => {
        if (table === 'golf_player_focus_areas') return fa.handler;
        if (table === 'golf_coach_insights') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: insightRow, error: null }) }) }) };
        }
        return emptyTable();
      },
    });
  }

  it('flag off: never reads golf_coach_insights, and the insert payload has no evidence_revision key', async () => {
    isFlagEnabledMock.mockReturnValue(false);
    const fa = makeFocusAreaTable();
    // insightRow present but must never be read while the flag is off.
    harness(fa, WELL_FORMED_INSIGHT_ROW);

    const result = await createFocusAreaFromInsightV2({
      playerId: 'player-1',
      insightId: 'insight-1',
      title: 'Approach',
      description: 'desc',
      areaType: 'iron_play',
      targetMetric: 'sg_approach_flag_off',
    });

    expect(result.success).toBe(true);
    expect(fa.inserted).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(fa.inserted[0], 'evidence_revision')).toBe(false);
  });

  it('flag on: stamps evidence_revision computed from the source insight', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    const fa = makeFocusAreaTable();
    harness(fa, WELL_FORMED_INSIGHT_ROW);

    const result = await createFocusAreaFromInsightV2({
      playerId: 'player-1',
      insightId: 'insight-1',
      title: 'Approach',
      description: 'desc',
      areaType: 'iron_play',
      targetMetric: 'sg_approach_flag_on',
    });

    expect(result.success).toBe(true);
    expect(fa.inserted).toHaveLength(1);
    expect(fa.inserted[0]!.evidence_revision).toBe(computeInsightEvidenceRevision(WELL_FORMED_INSIGHT_ROW));
  });

  it('flag on but the insight row is malformed: still creates the focus area, with no evidence_revision key', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    const fa = makeFocusAreaTable();
    harness(fa, MALFORMED_INSIGHT_ROW);

    const result = await createFocusAreaFromInsightV2({
      playerId: 'player-1',
      insightId: 'insight-1',
      title: 'Approach',
      description: 'desc',
      areaType: 'iron_play',
      targetMetric: 'sg_approach_malformed',
    });

    expect(result.success).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(fa.inserted[0], 'evidence_revision')).toBe(false);
  });

  it('flag on but the insight row is missing entirely: still creates the focus area, with no evidence_revision key', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    const fa = makeFocusAreaTable();
    harness(fa, null);

    const result = await createFocusAreaFromInsightV2({
      playerId: 'player-1',
      insightId: 'insight-1',
      title: 'Approach',
      description: 'desc',
      areaType: 'iron_play',
      targetMetric: 'sg_approach_missing',
    });

    expect(result.success).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(fa.inserted[0], 'evidence_revision')).toBe(false);
  });
});

describe('createFocusAreaFromInsight — legacy path evidence-revision flag gate', () => {
  function harness(fa: ReturnType<typeof makeFocusAreaTable>, insightRow: Record<string, unknown> | null) {
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach' });
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'golf_coaches') {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'coach-1' }, error: null }) }) }) };
        }
        if (table === 'golf_coach_insights') {
          return {
            // Two distinct reads against the same table in the real code:
            // the pre-existing metadata/content/team_id fetch (.single()),
            // and the A8 evidence-revision fetch (.maybeSingle()).
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { metadata: null, content: 'insight body', team_id: 'team-1' }, error: null }),
                maybeSingle: async () => ({ data: insightRow, error: null }),
              }),
            }),
            update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
          };
        }
        if (table === 'golf_player_focus_areas') return fa.handler;
        return emptyTable();
      },
    });
  }

  it('flag off: the insert payload has no evidence_revision key', async () => {
    isFlagEnabledMock.mockReturnValue(false);
    const fa = makeFocusAreaTable();
    harness(fa, WELL_FORMED_INSIGHT_ROW);

    const result = await createFocusAreaFromInsight({
      insight_id: 'insight-1',
      player_id: 'player-1',
      coach_id: 'coach-1',
      title: 'Putting',
      description: null,
      insight_type: 'stat_regression',
      target_metric: 'putts_flag_off',
    });

    expect(result.success).toBe(true);
    expect(fa.inserted).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(fa.inserted[0], 'evidence_revision')).toBe(false);
  });

  it('flag on: stamps evidence_revision computed from the source insight', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    const fa = makeFocusAreaTable();
    harness(fa, WELL_FORMED_INSIGHT_ROW);

    const result = await createFocusAreaFromInsight({
      insight_id: 'insight-1',
      player_id: 'player-1',
      coach_id: 'coach-1',
      title: 'Putting',
      description: null,
      insight_type: 'stat_regression',
      target_metric: 'putts_flag_on',
    });

    expect(result.success).toBe(true);
    expect(fa.inserted).toHaveLength(1);
    expect(fa.inserted[0]!.evidence_revision).toBe(computeInsightEvidenceRevision(WELL_FORMED_INSIGHT_ROW));
  });
});
