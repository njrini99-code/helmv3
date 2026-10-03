/**
 * Owner rule 1 (2026-10-01), review of the Qualifiers pass: the selection workspace loader feeds the writes. chooseTiePlace counts
 * `tie.chosen` from it and confirmSelection builds the squad and the picks from it. A failed picks read used to come back as "nobody
 * is selected": the "never more than the places" guard passed and a place could be given twice, and a confirm could rewrite a
 * coach's pick as a top-score place. A failed read is now a failed load (null), and the service says the workspace is not loadable
 * and writes nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reasons = vi.hoisted(() => ({ error: null as { message: string } | null }));
vi.mock('@/lib/golf/qualifier-selection-reasons', () => ({
  readQualifierSelectionReasons: async () => ({ reasons: new Map([['p-cal', 'Needs the experience']]), error: reasons.error }),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerException: vi.fn(), logServerEvent: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/qualifying/player-notify', () => ({ notifyPlayersOfSelectionOutcome: vi.fn(async () => {}) }));
vi.mock('@/lib/coachhelm/v3/qualifying/chat-push', () => ({ pushTravelBriefToChat: vi.fn(async () => {}) }));

const { loadQualifyingWorkspace } = await import('@/lib/coachhelm/v3/qualifying/loader');
const { chooseTiePlace, confirmSelection } = await import('@/lib/coachhelm/v3/qualifying/service');

type Row = Record<string, unknown>;

const entry = (id: string, first: string) => ({ player_id: id, player: { id, first_name: first, last_name: 'X' } });
// Ann leads; Ben and Cal are level at the last place on score (2 places, none for the coach: one place to give at the tie).
const ENTRIES = [entry('p-ann', 'Ann'), entry('p-ben', 'Ben'), entry('p-cal', 'Cal')];
const ROUNDS = [
  { player_id: 'p-ann', qualifier_round_number: 1, total_score: 70, score_to_par: -2 },
  { player_id: 'p-ben', qualifier_round_number: 1, total_score: 72, score_to_par: 0 },
  { player_id: 'p-cal', qualifier_round_number: 1, total_score: 72, score_to_par: 0 },
];

/** A chainable stand-in for the loader's reads and the service's writes: what the picks read answers, and every write it is asked for. */
function fakeSupabase(opts: { selections: Row[] | { error: string }; picks?: number }) {
  const writes: Array<{ table: string; op: string; row?: unknown }> = [];
  const qualifier = {
    id: 'q1',
    team_id: 't1',
    name: 'Fall',
    start_date: null,
    end_date: null,
    status: 'completed',
    selection_state: 'closed',
    selection_slots_total: 2 + (opts.picks ?? 0),
    selection_slots_coach_pick: opts.picks ?? 0,
    target_tournament_id: null,
    entries: ENTRIES,
  };
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    for (const m of ['select', 'eq', 'order']) q[m] = chain;
    q.maybeSingle = async () => ({ data: table === 'golf_qualifiers' ? qualifier : null, error: null });
    q.range = async () => ({ data: ROUNDS, error: null });
    q.then = (resolve: (v: unknown) => unknown) =>
      resolve(table === 'golf_qualifier_selections' ? ('error' in opts.selections ? { data: null, error: { message: opts.selections.error } } : { data: opts.selections, error: null }) : { data: [], error: null });
    q.upsert = async (row: unknown) => {
      writes.push({ table, op: 'upsert', row });
      return { error: null };
    };
    q.update = () => {
      writes.push({ table, op: 'update' });
      return q;
    };
    q.delete = () => {
      writes.push({ table, op: 'delete' });
      return q;
    };
    return q;
  };
  return { sb: { from } as never, writes };
}

beforeEach(() => {
  reasons.error = null;
});

describe('loadQualifyingWorkspace: a failed read is a failed load', () => {
  it('a healthy read loads, with the tie at the cut counted from the picks', async () => {
    const { sb } = fakeSupabase({ selections: [{ qualifier_id: 'q1', player_id: 'p-ben', selection_type: 'top_score', selected_at: null, selected_by_user_id: null }] });
    const ws = await loadQualifyingWorkspace(sb, 'q1');
    expect(ws?.tie_at_cut).toEqual({ places: 1, chosen: 1 });
  });

  it('a failed picks read is null, not a workspace with nobody selected', async () => {
    const { sb } = fakeSupabase({ selections: { error: 'connection reset' } });
    expect(await loadQualifyingWorkspace(sb, 'q1')).toBeNull();
  });

  it('a failed reasons read is null, not picks without their notes', async () => {
    reasons.error = { message: 'rpc failed' };
    const { sb } = fakeSupabase({ selections: [] });
    expect(await loadQualifyingWorkspace(sb, 'q1')).toBeNull();
  });
});

describe('the writes behind the workspace refuse when it did not load, and write nothing', () => {
  it('chooseTiePlace: a failed picks read is "workspace not loadable", never a place given on a count of zero', async () => {
    const { sb, writes } = fakeSupabase({ selections: { error: 'connection reset' } });
    expect(await chooseTiePlace(sb, { qualifier_id: 'q1', player_id: 'p-cal', user_id: 'u1', give: true })).toEqual({ ok: false, error: 'workspace not loadable' });
    expect(await chooseTiePlace(sb, { qualifier_id: 'q1', player_id: 'p-cal', user_id: 'u1', give: false })).toEqual({ ok: false, error: 'workspace not loadable' });
    expect(writes).toEqual([]);
  });

  it('chooseTiePlace: with the picks read, the same call gives the place (the control: the refusal above is the failed read)', async () => {
    const { sb, writes } = fakeSupabase({ selections: [] });
    expect(await chooseTiePlace(sb, { qualifier_id: 'q1', player_id: 'p-cal', user_id: 'u1', give: true })).toEqual({ ok: true, data: undefined });
    expect(writes).toEqual([{ table: 'golf_qualifier_selections', op: 'upsert', row: expect.objectContaining({ player_id: 'p-cal', selection_type: 'top_score' }) }]);
  });

  it('chooseTiePlace: a place already given is counted: a second give at the same tie is refused', async () => {
    const given = [{ qualifier_id: 'q1', player_id: 'p-ben', selection_type: 'top_score', selected_at: null, selected_by_user_id: null }];
    const { sb, writes } = fakeSupabase({ selections: given });
    expect(await chooseTiePlace(sb, { qualifier_id: 'q1', player_id: 'p-cal', user_id: 'u1', give: true })).toEqual({ ok: false, error: 'all 1 places at the cut are chosen' });
    expect(writes).toEqual([]);
  });

  it('confirmSelection: a failed picks read never rewrites a coach’s pick as a top-score place', async () => {
    // Cal is the coach's pick, with a reason. On a failed picks read the loader used to see no picks at all and offer Cal a place on score.
    const { sb, writes } = fakeSupabase({ selections: { error: 'connection reset' }, picks: 1 });
    expect(await confirmSelection(sb, { qualifier_id: 'q1', user_id: 'u1' })).toEqual({ ok: false, error: 'workspace not loadable' });
    expect(writes).toEqual([]);
  });

  it('confirmSelection: a failed reasons read refuses too, and writes nothing', async () => {
    reasons.error = { message: 'rpc failed' };
    const { sb, writes } = fakeSupabase({ selections: [], picks: 1 });
    expect(await confirmSelection(sb, { qualifier_id: 'q1', user_id: 'u1' })).toEqual({ ok: false, error: 'workspace not loadable' });
    expect(writes).toEqual([]);
  });
});
