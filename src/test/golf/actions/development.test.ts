import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({
  notifyDevPlanAssigned: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/coachhelm/v3/effectiveness/event-ledger', () => ({
  recordInsightAction: vi.fn().mockResolvedValue(undefined),
}));

const verifyPlayerAccessMock = vi.fn();
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: (...args: unknown[]) => verifyPlayerAccessMock(...args),
}));

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClientMock(),
}));

// Player self-promote to a focus area routes its INSERT through the service-role
// admin client (RLS has no player insert policy) — mock it so the self path is
// observable and doesn't touch a real service key.
const createAdminClientMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClientMock(),
}));

import {
  createFocusAreaFromInsight,
  createFocusAreaFromInsightV2,
  createFocusAreaFromReview,
  recordFocusAreaOutcome,
  updateFocusAreaProgress,
  deleteFocusArea,
  reactivateFocusArea,
} from '@/app/golf/actions/development';
import { recordInsightAction } from '@/lib/coachhelm/v3/effectiveness/event-ledger';

describe('createFocusAreaFromInsight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts with from_insight_id (NOT source_insight_id)', async () => {
    // Required since the 2026-05-23 audit added verifyPlayerAccess to
    // createFocusAreaFromInsight; without this the prod code reads
    // `undefined.allowed` and throws.
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach' });

    const insertSpy = vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({ data: { id: 'fa-1' }, error: null }),
      }),
    });

    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'golf_coaches') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { id: 'coach-1' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'golf_coach_insights') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { metadata: null, content: 'insight body' },
                  error: null,
                }),
              }),
            }),
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        if (table === 'golf_player_focus_areas') {
          return { insert: insertSpy };
        }
        return {};
      },
    });

    const result = await createFocusAreaFromInsight({
      insight_id: 'insight-1',
      player_id: 'player-1',
      coach_id: 'coach-1',
      title: 'Work on putts',
      description: null,
      insight_type: 'stat_regression',
    });

    expect(result.success).toBe(true);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const payload = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toBeDefined();
    expect(payload).toHaveProperty('from_insight_id', 'insight-1');
    expect(payload).not.toHaveProperty('source_insight_id');
  });

  /**
   * FocusAreaModal-prefill fidelity (converge-prescribe workflow): a coach
   * confirming triage/PromoteToFocusAreaButton's modal may have EDITED the
   * category away from the server's own insight_type/metadata-derived guess.
   * That explicit choice must win outright — silently falling back to the
   * derived guess would break "what you see in the modal is what saves."
   */
  function insightHarness(metadata: Record<string, unknown> | null) {
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach' });
    const insertSpy = vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({ data: { id: 'fa-1' }, error: null }),
      }),
    });
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'golf_coaches') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { id: 'coach-1' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'golf_coach_insights') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { metadata, content: 'insight body' },
                  error: null,
                }),
              }),
            }),
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        if (table === 'golf_player_focus_areas') {
          return { insert: insertSpy };
        }
        return {};
      },
    });
    return insertSpy;
  }

  it('an explicit area_type override wins over the insight_type/metadata-derived guess', async () => {
    // stat_regression + stat_name containing "putt" would normally derive to
    // 'putting' (refineAreaTypeFromMetadata) — an explicit override must beat
    // that guess, not be silently discarded.
    const insertSpy = insightHarness({ stat_name: 'putting_avg' });

    const result = await createFocusAreaFromInsight({
      insight_id: 'insight-1',
      player_id: 'player-1',
      coach_id: 'coach-1',
      title: 'Work on composure',
      description: null,
      insight_type: 'stat_regression',
      area_type: 'mental_game',
    });

    expect(result.success).toBe(true);
    const payload = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toHaveProperty('area_type', 'mental_game');
  });

  it('omitting area_type keeps the original insight_type/metadata-derived behavior (no regression for existing callers)', async () => {
    const insertSpy = insightHarness({ stat_name: 'putting_avg' });

    const result = await createFocusAreaFromInsight({
      insight_id: 'insight-1',
      player_id: 'player-1',
      coach_id: 'coach-1',
      title: 'Work on putts',
      description: null,
      insight_type: 'stat_regression',
    });

    expect(result.success).toBe(true);
    const payload = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toHaveProperty('area_type', 'putting');
  });
});

/**
 * A coach promoting an insight into a focus area (e.g. via
 * PromoteToFocusAreaButton on the Players tab) is PRESCRIBING it — it must
 * land as 'proposed'/started_at=null so the player has to accept, exactly
 * like the primary FocusAreaModal->createFocusArea flow. A player promoting
 * their OWN insight needs no consent step and starts 'active' immediately.
 * Pins the access.reason branch that closes that consent-model gap.
 */
describe('createFocusAreaFromInsightV2 — coach-promote consent model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeInsertSpy() {
    return vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({ data: { id: 'fa-new' }, error: null }),
      }),
    });
  }

  // reason='coach' → INSERT goes through the scoped client (coach RLS policy);
  // reason='self' → INSERT goes through the admin client (no player RLS policy,
  // ownership already proven by verifyPlayerAccess). Returns both spies so each
  // test asserts the path it exercises.
  function harness(reason: 'coach' | 'self' | 'denied') {
    verifyPlayerAccessMock.mockResolvedValue(
      reason === 'denied' ? { allowed: false, reason: 'denied' } : { allowed: true, reason },
    );
    const scopedInsert = makeInsertSpy();
    const adminInsert = makeInsertSpy();
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'golf_team_members') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: { team_id: 'team-1' }, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'golf_team_coach_staff') {
          return {
            select: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: { coach_id: 'coach-1' }, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'golf_player_focus_areas') {
          return { insert: scopedInsert };
        }
        return {};
      },
    });
    createAdminClientMock.mockReturnValue({
      from: (table: string) =>
        table === 'golf_player_focus_areas' ? { insert: adminInsert } : {},
    });
    return { scopedInsert, adminInsert };
  }

  it('inserts status="proposed" and started_at=null when a coach promotes (scoped client)', async () => {
    const { scopedInsert, adminInsert } = harness('coach');

    const result = await createFocusAreaFromInsightV2({
      playerId: 'player-1',
      insightId: 'insight-1',
      title: 'Work on putts',
      description: 'desc',
      areaType: 'putting',
    });

    expect(result.success).toBe(true);
    // Coach path uses the RLS-scoped client, NOT the admin client.
    expect(adminInsert).not.toHaveBeenCalled();
    const payload = scopedInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toHaveProperty('status', 'proposed');
    expect(payload).toHaveProperty('started_at', null);
  });

  it('inserts status="active" via the ADMIN client when the player self-promotes (P0 RLS fix)', async () => {
    const { scopedInsert, adminInsert } = harness('self');

    const result = await createFocusAreaFromInsightV2({
      playerId: 'player-1',
      insightId: 'insight-1',
      title: 'Work on putts',
      description: 'desc',
      areaType: 'putting',
    });

    expect(result.success).toBe(true);
    // Player self-promote must go through the admin client (RLS has no player
    // insert policy) — previously it used the scoped client and was rejected.
    expect(scopedInsert).not.toHaveBeenCalled();
    expect(adminInsert).toHaveBeenCalledTimes(1);
    const payload = adminInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toHaveProperty('status', 'active');
    expect(payload).toHaveProperty('player_id', 'player-1');
    expect(typeof payload.started_at).toBe('string');
  });

  it('rejects with Forbidden and writes nothing when verifyPlayerAccess denies', async () => {
    const { scopedInsert, adminInsert } = harness('denied');

    const result = await createFocusAreaFromInsightV2({
      playerId: 'not-mine',
      insightId: 'insight-1',
      title: 'x',
      description: 'y',
      areaType: 'putting',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
    expect(scopedInsert).not.toHaveBeenCalled();
    expect(adminInsert).not.toHaveBeenCalled();
  });

  /**
   * P1-12 / Fix 2 — `void recordInsightAction(...)` -> `await
   * recordInsightAction(...)`. In a serverless runtime an un-awaited call can
   * be dropped when the function's response is already flushed (measured:
   * 4 confirmed real from_insight_id focus-area creates, only 3 landed in
   * golf_insight_action — a ~25% loss on this exact call site). This is an
   * ordering proof, not a call-count proof: it holds the ledger write's
   * promise open with a controllable deferred and asserts the action's own
   * returned promise cannot resolve before the ledger write resolves. If the
   * call site regresses to `void recordInsightAction(...)`, the action
   * resolves immediately (fire-and-forget) and the first assertion below
   * fails.
   */
  it('awaits recordInsightAction before returning (regression guard against reverting to `void`)', async () => {
    harness('coach');

    const order: string[] = [];
    let resolveRecord: (() => void) | undefined;
    vi.mocked(recordInsightAction).mockImplementation(() => {
      order.push('record-called');
      return new Promise<void>((resolve) => {
        resolveRecord = () => {
          order.push('record-resolved');
          resolve();
        };
      });
    });

    const resultPromise = createFocusAreaFromInsightV2({
      playerId: 'player-1',
      insightId: 'insight-1',
      title: 'Work on putts',
      description: 'desc',
      areaType: 'putting',
    }).then((r) => {
      order.push('action-resolved');
      return r;
    });

    // Flush to a macrotask boundary WITHOUT resolving the ledger write. Node
    // always drains the microtask queue before running a scheduled macrotask,
    // so by the time this resolves, every microtask-based hop up to (and
    // including) the recordInsightAction call has already run — but the
    // action itself can only still be pending if it's truly blocked on our
    // unresolved deferred.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(['record-called']);

    resolveRecord?.();
    const result = await resultPromise;

    expect(order).toEqual(['record-called', 'record-resolved', 'action-resolved']);
    expect(result.success).toBe(true);
  });
});

describe('createFocusAreaFromReview — player self-promote RLS fix (P0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes the player self-promote INSERT through the admin client (active, from_review_id set)', async () => {
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });
    const scopedInsert = vi.fn();
    const adminInsert = vi.fn().mockReturnValue({
      select: () => ({ single: async () => ({ data: { id: 'fa-r' }, error: null }) }),
    });
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'golf_team_members') {
          return { select: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { team_id: 'team-1' }, error: null }) }) }) }) }) };
        }
        if (table === 'golf_team_coach_staff') {
          return { select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { coach_id: 'coach-1' }, error: null }) }) }) }) };
        }
        if (table === 'golf_player_focus_areas') {
          return { insert: scopedInsert };
        }
        return {};
      },
    });
    createAdminClientMock.mockReturnValue({
      from: (t: string) => (t === 'golf_player_focus_areas' ? { insert: adminInsert } : {}),
    });

    const result = await createFocusAreaFromReview({
      playerId: 'player-1',
      reviewId: 'rev-1',
      title: 'Tidy up lag putting',
      description: 'desc',
      areaType: 'putting',
    });

    expect(result.success).toBe(true);
    expect(scopedInsert).not.toHaveBeenCalled();
    expect(adminInsert).toHaveBeenCalledTimes(1);
    const payload = adminInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toHaveProperty('status', 'active');
    expect(payload).toHaveProperty('from_review_id', 'rev-1');
  });
});

describe('recordFocusAreaOutcome — persists outcome_status on the focus area (B5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes outcome_status onto golf_player_focus_areas even when there is no source insight', async () => {
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });
    const faUpdateSpy = vi.fn().mockReturnValue({
      eq: () => ({ in: () => ({ select: async () => ({ data: [{ id: 'fa-1' }], error: null }) }) }),
    });
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'golf_player_focus_areas') {
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { player_id: 'player-1', from_insight_id: null, status: 'active' }, error: null }) }) }),
            update: faUpdateSpy,
          };
        }
        return {};
      },
    });

    const result = await recordFocusAreaOutcome('fa-1', 'improved');

    expect(result.success).toBe(true);
    const payload = faUpdateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toHaveProperty('outcome_status', 'improved');
    expect(payload).toHaveProperty('status', 'completed');
  });
});

describe('updateFocusAreaProgress — ownership guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when verifyPlayerAccess denies', async () => {
    verifyPlayerAccessMock.mockResolvedValue({ allowed: false, reason: 'denied' });

    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { player_id: 'p-1' }, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: async () => ({ data: [{ id: 'fa-1' }], error: null }),
          }),
        }),
      }),
    });

    const result = await updateFocusAreaProgress('fa-1', 42);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/forbidden/i);
  });

  it('allows when verifyPlayerAccess grants', async () => {
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach' });

    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { player_id: 'p-1', status: 'active' }, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            in: () => ({
              select: async () => ({ data: [{ id: 'fa-1' }], error: null }),
            }),
          }),
        }),
      }),
    });

    const result = await updateFocusAreaProgress('fa-1', 42);
    expect(result.success).toBe(true);
  });

  it('rejects a proposed (not yet accepted) focus area', async () => {
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach' });

    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { player_id: 'p-1', status: 'proposed' }, error: null }),
          }),
        }),
      }),
    });

    const result = await updateFocusAreaProgress('fa-1', 42);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/hasn.t been accepted/i);
  });

  it('rejects a declined focus area', async () => {
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach' });

    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { player_id: 'p-1', status: 'declined' }, error: null }),
          }),
        }),
      }),
    });

    const result = await updateFocusAreaProgress('fa-1', 42);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/declined/i);
  });
});

/**
 * P100: the Log-progress dialog passes the coach's note through to
 * updateFocusAreaProgress, and a note is what makes the action append a
 * progress_notes entry — the source the per-area Sparkline reads. These tests
 * pin that contract so value-only logs stay no-append while noted logs append a
 * { at, value, note } entry (the trend chart actually populates).
 */
describe('updateFocusAreaProgress — progress_notes append (Sparkline source)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach' });
  });

  function harness(existingProgressNotes: unknown) {
    const updateSpy = vi.fn().mockReturnValue({
      eq: () => ({
        in: () => ({
          select: async () => ({ data: [{ id: 'fa-1' }], error: null }),
        }),
      }),
    });
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { player_id: 'p-1', status: 'active', progress_notes: existingProgressNotes },
              error: null,
            }),
          }),
        }),
        update: updateSpy,
      }),
    });
    return updateSpy;
  }

  it('does NOT append a progress_notes entry for a value-only log', async () => {
    const updateSpy = harness(null);

    const result = await updateFocusAreaProgress('fa-1', 42);

    expect(result.success).toBe(true);
    const payload = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toHaveProperty('current_value', 42);
    expect(payload).not.toHaveProperty('progress_notes');
  });

  it('appends a { at, value, note } entry when a note is supplied', async () => {
    const updateSpy = harness(null);

    const result = await updateFocusAreaProgress('fa-1', 42, { note: '  tighter today  ' });

    expect(result.success).toBe(true);
    const payload = updateSpy.mock.calls[0]?.[0] as { progress_notes?: { entries: unknown[] } };
    expect(payload.progress_notes).toBeDefined();
    expect(Array.isArray(payload.progress_notes!.entries)).toBe(true);
    expect(payload.progress_notes!.entries).toHaveLength(1);
    const entry = payload.progress_notes!.entries[0] as Record<string, unknown>;
    expect(entry).toHaveProperty('value', 42);
    // Note is trimmed before persisting.
    expect(entry).toHaveProperty('note', 'tighter today');
    expect(typeof entry.at).toBe('string');
  });

  it('preserves prior entries and appends the new one (oldest→newest)', async () => {
    const updateSpy = harness({
      entries: [{ at: '2026-06-01T00:00:00.000Z', value: 50, note: 'baseline' }],
    });

    const result = await updateFocusAreaProgress('fa-1', 44, { note: 'progress' });

    expect(result.success).toBe(true);
    const payload = updateSpy.mock.calls[0]?.[0] as { progress_notes: { entries: { value: number }[] } };
    expect(payload.progress_notes.entries).toHaveLength(2);
    expect(payload.progress_notes.entries[0]!.value).toBe(50);
    expect(payload.progress_notes.entries[1]!.value).toBe(44);
  });

  it('treats a whitespace-only note as no note (no append)', async () => {
    const updateSpy = harness(null);

    const result = await updateFocusAreaProgress('fa-1', 42, { note: '   ' });

    expect(result.success).toBe(true);
    const payload = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('progress_notes');
  });
});

/**
 * P092: deleteFocusArea is the server action behind the restored Delete
 * affordance in the Fairway FocusAreaCard. These tests pin its coach-only
 * ownership guard (delete is scoped by coach_id) and its auth gates.
 */
describe('deleteFocusArea — coach-only, ownership-scoped', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an unauthenticated caller', async () => {
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      from: () => ({}),
    });

    const result = await deleteFocusArea('fa-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/authenticated/i);
  });

  it('rejects a non-coach caller', async () => {
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'golf_coaches') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: null, error: { message: 'no row' } }),
              }),
            }),
          };
        }
        return {};
      },
    });

    const result = await deleteFocusArea('fa-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not authorized/i);
  });

  it('deletes scoped by id AND coach_id when the caller owns the focus area', async () => {
    const eqChain: string[] = [];
    const deleteSpy = vi.fn().mockReturnValue({
      eq: (col: string) => {
        eqChain.push(col);
        return {
          eq: (col2: string) => {
            eqChain.push(col2);
            return Promise.resolve({ error: null });
          },
        };
      },
    });

    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'golf_coaches') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { id: 'coach-1' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'golf_player_focus_areas') {
          return { delete: deleteSpy };
        }
        return {};
      },
    });

    const result = await deleteFocusArea('fa-1');
    expect(result.success).toBe(true);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    // Ownership scope: deletion is filtered by both id and coach_id.
    expect(eqChain).toEqual(['id', 'coach_id']);
  });
});

/**
 * P175: reactivateFocusArea is the inverse of completeFocusArea — it powers the
 * "Undo" on an accidental complete and the "Reopen" button on completed cards
 * (Nielsen #3 user control / #5 error prevention). These tests pin its auth +
 * ownership gates, the exact un-complete payload (status='active', completed_at
 * cleared), and the 0-row-update failure guard so a no-op never reports success.
 */
describe('reactivateFocusArea — reopen a completed area', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function harness({
    user = { id: 'user-1' } as { id: string } | null,
    focusArea = { player_id: 'p-1', status: 'completed' } as Record<string, unknown> | null,
    updated = [{ id: 'fa-1' }] as { id: string }[] | null,
    updateError = null as { message: string } | null,
  }) {
    const updateSpy = vi.fn().mockReturnValue({
      eq: () => ({
        select: async () => ({ data: updated, error: updateError }),
      }),
    });
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user }, error: null }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: focusArea, error: null }),
          }),
        }),
        update: updateSpy,
      }),
    });
    return updateSpy;
  }

  it('rejects an unauthenticated caller', async () => {
    harness({ user: null });
    const result = await reactivateFocusArea('fa-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/authenticated/i);
  });

  it('rejects when the focus area does not exist', async () => {
    harness({ focusArea: null });
    const result = await reactivateFocusArea('fa-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('rejects when verifyPlayerAccess denies', async () => {
    verifyPlayerAccessMock.mockResolvedValue({ allowed: false, reason: 'denied' });
    harness({});
    const result = await reactivateFocusArea('fa-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/forbidden/i);
  });

  it('sets status=active and clears completed_at when permitted', async () => {
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach' });
    const updateSpy = harness({});

    const result = await reactivateFocusArea('fa-1');

    expect(result.success).toBe(true);
    const payload = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toHaveProperty('status', 'active');
    expect(payload).toHaveProperty('completed_at', null);
    // Never re-stamps completion — that's the whole point of reopening.
    expect(payload).not.toHaveProperty('status', 'completed');
  });

  it('fails (not silent success) when the update matches 0 rows', async () => {
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach' });
    harness({ updated: [] });

    const result = await reactivateFocusArea('fa-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found or not permitted/i);
  });
});
