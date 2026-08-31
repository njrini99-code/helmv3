/**
 * `updateRoundType` — the round-type edit a coach asked for on 2026-08-19
 * ("UNCW boys accidentally clicked practice instead of qualifier").
 *
 * The assertion that carries this file is QUALIFIER LINKAGE, not the type
 * column. A round appears in a qualifier's results because of `qualifier_id`;
 * `round_type` only decides whether it COUNTS as qualifying. Set the type
 * without the id and you get a round that says "qualifier" everywhere in the
 * UI, passes every type check, and is still absent from the standings — the
 * exact shape of #916, documented at round-drafts.ts:167, where the draft path
 * dropped `qualifier_id` "even when round_type correctly said 'qualifier'".
 *
 * Production holds that invariant today: 14 qualifier rounds, 14 with a
 * `qualifier_id`, 0 without. These tests exist so this action is not the first
 * thing to break it — and so the break would be loud rather than invisible.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = {
  user: { id: 'user-1' } as { id: string } | null,
  round: {
    id: 'round-1',
    player_id: 'player-1',
    team_id: 'team-1',
    round_type: 'practice',
    status: 'completed',
    qualifier_id: null as string | null,
    qualifier_round_number: null as number | null,
  } as Record<string, unknown> | null,
  ownPlayer: { id: 'player-1' } as { id: string } | null,
  qualifier: { id: 'qual-1', status: 'in_progress', num_rounds: 3, team_id: 'team-1' } as Record<string, unknown> | null,
  entry: { id: 'entry-1' } as { id: string } | null,
  /** Whether this user is a golf coach at all, and of THIS round's team. */
  coachRow: null as { id: string } | null,
  staffRow: null as { coach_id: string } | null,
  /** What the action entered the player into, if anything. */
  entered: null as Record<string, unknown> | null,
  /** Set when the action deleted an entry it had just created. */
  entryDeleted: false,
  clash: null as { id: string } | null,
  /** What the action actually wrote. The point of the whole file. */
  written: null as Record<string, unknown> | null,
  updateError: null as { message: string } | null,
  /**
   * The action queries `golf_rounds` twice — once to load the round, once to
   * probe for a round-number clash. The fake has to answer differently each
   * time, and this flag is how it tells them apart.
   */
  roundRead: false,
};

/** Minimal PostgREST-shaped chain: every filter returns `this`. */
function table(name: string) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'neq', 'in', 'order', 'limit']) chain[m] = vi.fn(self);

  chain.maybeSingle = vi.fn(async () => {
    switch (name) {
      case 'golf_rounds':
        // The clash probe runs after the round read; distinguish by whether
        // the action has already resolved a round.
        if (state.round && !state.roundRead) {
          state.roundRead = true;
          return { data: state.round, error: null };
        }
        return { data: state.clash, error: null };
      case 'golf_players':
        return { data: state.ownPlayer, error: null };
      case 'golf_qualifiers':
        return { data: state.qualifier, error: null };
      case 'golf_qualifier_entries':
        return { data: state.entry, error: null };
      case 'golf_coaches':
        return { data: state.coachRow, error: null };
      case 'golf_team_coach_staff':
        return { data: state.staffRow, error: null };
      default:
        return { data: null, error: null };
    }
  });

  chain.upsert = vi.fn(async (payload: Record<string, unknown>) => {
    if (name === 'golf_qualifier_entries') state.entered = payload;
    return { error: null };
  });

  chain.delete = vi.fn(() => {
    if (name === 'golf_qualifier_entries') state.entryDeleted = true;
    const d: Record<string, unknown> = {};
    d.eq = vi.fn(() => d);
    // Awaiting the builder is how the action consumes it.
    (d as { then?: unknown }).then = (resolve: (v: unknown) => unknown) => resolve({ error: null });
    return d;
  });

  chain.update = vi.fn((payload: Record<string, unknown>) => {
    state.written = payload;
    return { eq: vi.fn(async () => ({ error: state.updateError })) };
  });

  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: state.user }, error: null })) },
    from: vi.fn((name: string) => table(name)),
    // The write moved off `.update()` and onto the `reclassify_golf_round`
    // RPC (migration 20260824030000), because the lifecycle guard on
    // `golf_rounds` rejects every direct UPDATE to a completed round — which
    // is what stopped players fixing a qualifier round they had recorded as
    // practice. Recorded into `state.written` in the same shape the direct
    // update used, so every assertion below still asserts the same thing:
    // what actually gets persisted.
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn !== 'reclassify_golf_round') return { data: null, error: null };
      if (state.updateError) return { data: null, error: state.updateError };
      state.written = {
        round_type: args.p_round_type,
        qualifier_id: args.p_qualifier_id,
        qualifier_round_number: args.p_qualifier_round_number,
      };
      return { data: 'round-1', error: null };
    }),
  })),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// Refreshing the stored standings needs a service-role client. It is
// best-effort in the action and irrelevant to what these tests assert.
vi.mock('@/lib/golf/qualifier-standings', () => ({
  updateQualifierEntryStats: vi.fn(async () => {}),
}));

const { updateRoundType } = await import('../round-type');

beforeEach(() => {
  state.user = { id: 'user-1' };
  state.round = {
    id: 'round-1',
    player_id: 'player-1',
    team_id: 'team-1',
    round_type: 'practice',
    status: 'completed',
    qualifier_id: null,
    qualifier_round_number: null,
  };
  state.ownPlayer = { id: 'player-1' };
  state.qualifier = { id: 'qual-1', status: 'in_progress', num_rounds: 3, team_id: 'team-1' };
  state.coachRow = null;
  state.staffRow = null;
  state.entered = null;
  state.entryDeleted = false;
  state.entry = { id: 'entry-1' };
  state.clash = null;
  state.written = null;
  state.updateError = null;
  state.roundRead = false;
});

describe('updateRoundType — the coach-reported case', () => {
  it('changes practice -> qualifier AND attaches the qualifier id', async () => {
    const res = await updateRoundType({
      roundId: 'round-1',
      roundType: 'qualifier',
      qualifierId: 'qual-1',
      qualifierRoundNumber: 2,
    });

    expect(res.success).toBe(true);
    // Both columns, together. Type alone would be the silent failure.
    expect(state.written).toMatchObject({
      round_type: 'qualifier',
      qualifier_id: 'qual-1',
      qualifier_round_number: 2,
    });
  });

  it('REFUSES to make a round a qualifier with no qualifier attached', async () => {
    const res = await updateRoundType({ roundId: 'round-1', roundType: 'qualifier' });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/pick which qualifier/i);
    // Nothing written at all — better a refusal than an orphan.
    expect(state.written).toBeNull();
  });

  it('clears the linkage when a qualifier round becomes practice', async () => {
    state.round = { ...state.round!, round_type: 'qualifier', qualifier_id: 'qual-1', qualifier_round_number: 1 };

    const res = await updateRoundType({ roundId: 'round-1', roundType: 'practice' });

    expect(res.success).toBe(true);
    expect(state.written).toMatchObject({
      round_type: 'practice',
      qualifier_id: null,
      qualifier_round_number: null,
    });
  });
});

describe('updateRoundType — guards', () => {
  it('rejects an unauthenticated caller before reading anything', async () => {
    state.user = null;
    const res = await updateRoundType({ roundId: 'round-1', roundType: 'practice' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/signed in/i);
    expect(state.written).toBeNull();
  });

  it('rejects a caller who is neither the player nor a coach of the team', async () => {
    state.ownPlayer = null; // not their round; no coach row resolves either
    const res = await updateRoundType({ roundId: 'round-1', roundType: 'tournament' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/permission/i);
    expect(state.written).toBeNull();
  });

  // A missing entry is no longer a dead end for a coach — it is the ordinary
  // shape of "turn this practice round into a qualifier round", because a
  // player who has not played the qualifier yet has no entry row. The refusal
  // that used to live here told the COACH that a coach had to fix it, which
  // is the loop the 2026-08-31 report described.
  //
  // It stays a refusal for a player, because RLS INSERT on
  // golf_qualifier_entries is coach-only: letting the action try would just
  // move the same dead end one step later, into a silent zero-row write.
  it('refuses a qualifier the player is not entered in — when a PLAYER asks', async () => {
    state.entry = null;
    const res = await updateRoundType({
      roundId: 'round-1',
      roundType: 'qualifier',
      qualifierId: 'qual-1',
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/ask your coach/i);
    expect(state.written).toBeNull();
    expect(state.entered).toBeNull();
  });

  it('ENTERS the player and proceeds when a COACH asks', async () => {
    state.entry = null;
    state.ownPlayer = null; // the coach is not the player
    state.coachRow = { id: 'coach-1' };
    state.staffRow = { coach_id: 'coach-1' };

    const res = await updateRoundType({
      roundId: 'round-1',
      roundType: 'qualifier',
      qualifierId: 'qual-1',
      qualifierRoundNumber: 2,
    });

    expect(res.success).toBe(true);
    // The entry is what makes the round appear in the standings at all:
    // get_qualifier_leaderboard reads FROM golf_qualifier_entries and LEFT
    // JOINs the rounds, so linking the round without one files it where the
    // player is listed nowhere.
    expect(state.entered).toEqual({ qualifier_id: 'qual-1', player_id: 'player-1' });
    expect(state.written).toEqual({
      round_type: 'qualifier',
      qualifier_id: 'qual-1',
      qualifier_round_number: 2,
    });
  });

  // The page scopes its picker by the ROUND's team, but the picker is a
  // convenience and this is the enforcement. Production holds 12 rounds whose
  // team_id is not a membership of their own player, so the two can diverge.
  it('refuses a qualifier belonging to a different team, and enters nobody', async () => {
    state.entry = null;
    state.ownPlayer = null;
    state.coachRow = { id: 'coach-1' };
    state.staffRow = { coach_id: 'coach-1' };
    state.qualifier = { id: 'qual-1', status: 'in_progress', num_rounds: 3, team_id: 'other-team' };

    const res = await updateRoundType({
      roundId: 'round-1',
      roundType: 'qualifier',
      qualifierId: 'qual-1',
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/different team/i);
    expect(state.entered).toBeNull();
    expect(state.written).toBeNull();
  });

  // An entry with no round puts the player on the coach's leaderboard at zero,
  // produced by a save that reported failure.
  it('undoes an entry it created when the write is then refused', async () => {
    state.entry = null;
    state.ownPlayer = null;
    state.coachRow = { id: 'coach-1' };
    state.staffRow = { coach_id: 'coach-1' };
    state.updateError = { message: 'refused', code: '23505' } as { message: string };

    const res = await updateRoundType({
      roundId: 'round-1',
      roundType: 'qualifier',
      qualifierId: 'qual-1',
    });

    expect(res.success).toBe(false);
    expect(state.entered).not.toBeNull();
    expect(state.entryDeleted).toBe(true);
  });

  it('does not enter the player when one already exists', async () => {
    state.ownPlayer = null;
    state.coachRow = { id: 'coach-1' };
    state.staffRow = { coach_id: 'coach-1' };

    const res = await updateRoundType({
      roundId: 'round-1',
      roundType: 'qualifier',
      qualifierId: 'qual-1',
    });

    expect(res.success).toBe(true);
    expect(state.entered).toBeNull();
  });

  // Reversed 2026-08-31 on the owner's instruction: there is no time limit on
  // correcting what a round counts toward. A round recorded as practice by
  // mistake was always meant to count in that qualifier, and the competition
  // ending does not make the mistake less wrong. The editor labels a completed
  // qualifier as completed so the standings move visibly, not silently.
  it('ALLOWS a completed qualifier — no time limit on a correction', async () => {
    state.qualifier = { id: 'qual-1', status: 'completed', num_rounds: 3, team_id: 'team-1' };
    const res = await updateRoundType({
      roundId: 'round-1',
      roundType: 'qualifier',
      qualifierId: 'qual-1',
      qualifierRoundNumber: 2,
    });
    expect(res.success).toBe(true);
    expect(state.written).toEqual({
      round_type: 'qualifier',
      qualifier_id: 'qual-1',
      qualifier_round_number: 2,
    });
  });

  it('refuses a round number beyond the qualifier length', async () => {
    const res = await updateRoundType({
      roundId: 'round-1',
      roundType: 'qualifier',
      qualifierId: 'qual-1',
      qualifierRoundNumber: 9,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/only has 3 rounds/i);
  });

  it('rejects a round type outside the editable set', async () => {
    const res = await updateRoundType({
      roundId: 'round-1',
      // @ts-expect-error — deliberately outside EditableRoundType
      roundType: 'casual',
    });
    expect(res.success).toBe(false);
    expect(state.written).toBeNull();
  });
});
