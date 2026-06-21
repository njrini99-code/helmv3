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

const verifyPlayerAccessMock = vi.fn();
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: (...args: unknown[]) => verifyPlayerAccessMock(...args),
}));

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClientMock(),
}));

import {
  createFocusAreaFromInsight,
  updateFocusAreaProgress,
  deleteFocusArea,
  reactivateFocusArea,
} from '@/app/golf/actions/development';

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
    expect(result.success).toBe(true);
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
        select: async () => ({ data: [{ id: 'fa-1' }], error: null }),
      }),
    });
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { player_id: 'p-1', progress_notes: existingProgressNotes },
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
