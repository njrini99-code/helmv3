/**
 * loadCorrectionWeightsForPlayer: resolves the player's primary coach, reads
 * that coach's corrections with the insight's family, and never throws (the
 * corrections table is held, so a missing table is "not available").
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ logServerError: vi.fn(async (..._args: unknown[]) => undefined) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: h.logServerError }));

import { loadCorrectionWeightsForPlayer } from '../load-weights';

const COACH_USER = 'coach-user-1';

interface Fake {
  corrections: { data: unknown; error: unknown };
  coach: { user_id: string } | null;
  filters: Record<string, unknown>;
}

function client(fake: Fake) {
  const from = (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      eq: (k: string, v: unknown) => {
        if (table === 'golf_coachhelm_corrections') fake.filters[k] = v;
        return b;
      },
      order: () => b,
      limit: () => (table === 'golf_coachhelm_corrections' ? Promise.resolve(fake.corrections) : b),
      maybeSingle: async () => {
        if (table === 'golf_team_members') return { data: { team_id: 'team-1' }, error: null };
        if (table === 'golf_team_coach_staff') return { data: { coach_id: 'coach-1' }, error: null };
        if (table === 'golf_coaches') return { data: fake.coach, error: null };
        throw new Error(`unexpected table ${table}`);
      },
    };
    return b;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from } as any;
}

function row(kind: string, family: string | null, minute: number, insight = `r-${minute}`) {
  return {
    insight_id: insight,
    author_user_id: COACH_USER,
    author_role: 'coach',
    kind,
    created_at: new Date(Date.UTC(2026, 9, 1, 0, minute)).toISOString(),
    insight: family === null ? null : { insight_type: family },
  };
}

let fake: Fake;
beforeEach(() => {
  h.logServerError.mockClear();
  fake = { corrections: { data: [], error: null }, coach: { user_id: COACH_USER }, filters: {} };
});

describe('loadCorrectionWeightsForPlayer', () => {
  it('reads the primary coach’s own coach-role corrections and computes W per family', async () => {
    fake.corrections = {
      data: [
        row('confirm', 'approach_miss', 3),
        row('not_this', 'putt_distance', 2),
        row('not_this', 'putt_distance', 1),
        row('not_this', null, 4), // insight not visible: no family, skipped
      ],
      error: null,
    };
    expect(await loadCorrectionWeightsForPlayer(client(fake), 'player-1')).toEqual({
      putt_distance: 0.8,
      approach_miss: 1.05,
    });
    expect(fake.filters).toEqual({ author_user_id: COACH_USER, author_role: 'coach' });
  });

  it.each(['42P01', 'PGRST205'])('missing table (%s): {} without logging', async (code) => {
    fake.corrections = { data: null, error: { code, message: 'missing' } };
    expect(await loadCorrectionWeightsForPlayer(client(fake), 'player-1')).toEqual({});
    expect(h.logServerError).not.toHaveBeenCalled();
  });

  it('another read error: {} and one warning', async () => {
    fake.corrections = { data: null, error: { code: '57014', message: 'timeout' } };
    expect(await loadCorrectionWeightsForPlayer(client(fake), 'player-1')).toEqual({});
    expect(h.logServerError).toHaveBeenCalledTimes(1);
    expect(h.logServerError.mock.calls[0]).toContain('warning');
  });

  it('no primary coach user: {} without reading corrections', async () => {
    fake.coach = null;
    expect(await loadCorrectionWeightsForPlayer(client(fake), 'player-1')).toEqual({});
    expect(fake.filters).toEqual({});
  });

  it('a thrown client error: {} (never throws into a feed)', async () => {
    const broken = {
      from: () => {
        throw new Error('boom');
      },
    };
    await expect(loadCorrectionWeightsForPlayer(broken as never, 'player-1')).resolves.toEqual({});
  });
});
