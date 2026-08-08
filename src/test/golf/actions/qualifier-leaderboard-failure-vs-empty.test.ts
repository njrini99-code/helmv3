import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A qualifier leaderboard has two very different "nothing here" states, and
 * this action used to render them identically.
 *
 * supabase-js RESOLVES database errors as `{ data: null, error }` — it does not
 * throw — so `const { data } = await …` silently turns a failed read into an
 * empty one. On this path that produced, in order of increasing damage:
 *   - a qualifier that "doesn't exist" because a connection dropped,
 *   - a full field rendered as "no entries yet",
 *   - and a complete, confident leaderboard on which nobody has posted a
 *     score, because the ROUNDS read failed and every consumer reads
 *     `rounds || []`.
 *
 * Coaches pick travel squads off that last screen.
 */

const logServerError = vi.fn(async () => {});

vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

type Outcome = { data: unknown; error: unknown };

const outcomes = new Map<string, Outcome>();
const ok = (data: unknown): Outcome => ({ data, error: null });
const fails = (message: string, code = '08006'): Outcome => ({ data: null, error: { message, code } });

const QUALIFIER = { id: 'q1', name: 'Fall Qualifier', description: null, course_name: null, start_date: null, end_date: null, status: 'in_progress', spots_available: null, entry_deadline: null, rules: null };
const ENTRY = { player_id: 'p1', player: { id: 'p1', first_name: 'Ada', last_name: 'Byron', avatar_url: null } };

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok([]);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    neq: self,
    in: self,
    order: self,
    limit: self,
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => tableChain(table),
  }),
}));

async function leaderboard() {
  const { getQualifierLeaderboard } = await import('@/app/golf/actions/golf');
  return getQualifierLeaderboard('q1');
}

/**
 * `withAdminObserved` logs any `{ success: false }` return as well, so counting
 * calls would pin the wrapper's behaviour rather than this action's. Match on
 * what was said instead.
 */
const logged = () => logServerError.mock.calls.map((call) => String((call as unknown[])[0]));

describe('getQualifierLeaderboard — a failed read is not an empty field', () => {
  beforeEach(() => {
    logServerError.mockClear();
    outcomes.clear();
    outcomes.set('golf_qualifiers', ok(QUALIFIER));
    outcomes.set('golf_players', ok({ id: 'p1' }));
    outcomes.set('golf_qualifier_entries', ok([ENTRY]));
    outcomes.set('golf_rounds', ok([{ player_id: 'p1', qualifier_round_number: 1, total_score: 74, score_to_par: 2 }]));
  });

  it('still serves a real leaderboard when every read succeeds', async () => {
    const result = await leaderboard();

    expect(result.success).toBe(true);
    expect(result.success && result.data.leaderboard).toHaveLength(1);
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('reports an empty field as empty, not as a failure', async () => {
    outcomes.set('golf_qualifier_entries', ok([]));

    const result = await leaderboard();

    expect(result.success).toBe(true);
    expect(result.success && result.data.leaderboard).toEqual([]);
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('fails loudly when the ENTRIES read fails, instead of showing an empty field', async () => {
    outcomes.set('golf_qualifier_entries', fails('connection terminated'));

    const result = await leaderboard();

    expect(result.success).toBe(false);
    expect(logged().some((message) => /entries read failed/.test(message))).toBe(true);
  });

  it('fails loudly when the ROUNDS read fails, instead of showing a scoreless leaderboard', async () => {
    outcomes.set('golf_rounds', fails('statement timeout', '57014'));

    const result = await leaderboard();

    expect(result.success).toBe(false);
    expect(logged().some((message) => /rounds read failed/.test(message))).toBe(true);
  });

  it('fails loudly when the PLAYER lookup fails, rather than guessing the player is not entered', async () => {
    outcomes.set('golf_players', fails('permission denied', '42501'));

    const result = await leaderboard();

    expect(result.success).toBe(false);
    expect(logged().some((message) => /player lookup failed/.test(message))).toBe(true);
  });

  it('a coach with no golf_players row is not an error — they still see the board', async () => {
    outcomes.set('golf_players', ok(null));

    const result = await leaderboard();

    expect(result.success).toBe(true);
    expect(result.success && result.data.currentPlayerId).toBeNull();
    expect(result.success && result.data.isPlayerEntered).toBe(false);
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('distinguishes a genuinely missing qualifier from a qualifier read that failed', async () => {
    outcomes.set('golf_qualifiers', { data: null, error: { message: 'no rows', code: 'PGRST116' } });
    const missing = await leaderboard();
    expect(missing.success).toBe(false);
    expect(!missing.success && missing.error).toMatch(/not found/i);
    expect(logged().some((message) => /read failed/.test(message))).toBe(false);

    outcomes.set('golf_qualifiers', fails('could not connect'));
    const broken = await leaderboard();
    expect(broken.success).toBe(false);
    expect(!broken.success && broken.error).not.toMatch(/not found/i);
    expect(logged().some((message) => /qualifier read failed/.test(message))).toBe(true);
  });
});
