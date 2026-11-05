import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => true }));

import { buildPlayerTools, PLAYER_INSTRUCTIONS } from '../player-tools';

const ctx = { coach_id: '', user_id: 'u', team_id: 't', team_name: 'Team', timezone: 'UTC', roster: [{ id: 'me', name: 'Me Myself' }] } as never;
const tools = buildPlayerTools({ sb: {} as never, ctx, playerId: 'me', writer: { write: () => {} } as never, collect: () => {} });

describe('player Ask tool set', () => {
  it('has no write, no ranking and no team read', () => {
    for (const k of Object.keys(tools)) {
      expect(k).not.toMatch(/^(create|set|add|draft|save|publish|request|send|update|delete)_/);
    }
    for (const banned of ['compare_players', 'get_team_metric_ranking', 'get_team_overview', 'get_team_rounds', 'get_team_patterns']) expect(tools[banned]).toBeUndefined();
  });
  it('tells the model never to name another player', () => {
    expect(PLAYER_INSTRUCTIONS('Me', 'Team', 'UTC')).toMatch(/Never name another player/);
  });
});

type Row = Record<string, unknown>;
/** Just enough of PostgREST: every filter narrows the table's rows, so a query that forgets `player_id` returns the teammates' rows. */
function fakeDb(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (k: string, v: unknown) => ((rows = rows.filter((r) => r[k] === v)), q),
      neq: (k: string, v: unknown) => ((rows = rows.filter((r) => r[k] !== v)), q),
      in: (k: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[k]))), q),
      not: () => q,
      or: () => q,
      gte: () => q,
      lte: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (ok: (r: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok),
    };
    return q;
  };
  return { from } as never;
}

/** Runs a tool and returns everything that left the server: the model's result, the `data-*` stream parts and the collected envelope. */
async function run(sb: never, name: string, input: object) {
  const written: unknown[] = [];
  const collected: unknown[] = [];
  const set = buildPlayerTools({ sb, ctx, playerId: 'me', writer: { write: (p: unknown) => written.push(p) } as never, collect: (e) => collected.push(e) });
  const result = await set[name]!.execute!(input as never, {} as never);
  return { result: result as { detail?: { events?: Row[]; reads?: Row[] } }, wire: JSON.stringify([result, written, collected]) };
}

describe('get_upcoming_events for a player', () => {
  const soon = new Date(Date.now() + 86_400_000).toISOString();
  const db = () =>
    fakeDb({
      golf_events: [
        { id: 'ev1', team_id: 't', title: 'Qualifier', event_type: 'tournament', start_time: soon, end_time: soon, location: 'Home', requires_rsvp: true, rsvp_deadline: soon, status: 'scheduled' },
        { id: 'ev2', team_id: 't', title: 'Lift', event_type: 'practice', start_time: soon, end_time: soon, location: 'Gym', requires_rsvp: false, rsvp_deadline: null, status: 'scheduled' },
      ],
      golf_event_attendance: [
        { event_id: 'ev1', player_id: 'me', status: 'accepted' },
        { event_id: 'ev1', player_id: 'teammate-a', status: 'declined' },
        { event_id: 'ev1', player_id: 'teammate-b', status: 'pending' },
      ],
    });

  it('carries the player’s own reply and no count, name or id of a teammate, anywhere on the wire', async () => {
    const { result, wire } = await run(db(), 'get_upcoming_events', { days_ahead: 14 });
    const [rsvp, plain] = result.detail!.events!;
    expect(rsvp).toMatchObject({ event_id: 'ev1', requires_rsvp: true, my_rsvp: 'accepted' });
    for (const key of ['rsvp_accepted', 'rsvp_declined', 'rsvp_pending_count', 'rsvp_pending_names', 'teammate-a', 'teammate-b', 'Unknown']) expect(wire).not.toContain(key);
    expect(plain).not.toHaveProperty('my_rsvp');
  });

  it('says not replied when the player has no row, and still nothing about the team', async () => {
    const noRow = fakeDb({
      golf_events: [{ id: 'ev1', team_id: 't', title: 'Qualifier', event_type: 'tournament', start_time: soon, end_time: soon, location: 'Home', requires_rsvp: true, rsvp_deadline: soon, status: 'scheduled' }],
      golf_event_attendance: [{ event_id: 'ev1', player_id: 'teammate-a', status: 'accepted' }],
    });
    const { result, wire } = await run(noRow, 'get_upcoming_events', { days_ahead: 14 });
    expect(result.detail!.events![0]).toMatchObject({ my_rsvp: 'no_reply' });
    expect(wire).not.toContain('teammate-a');
  });
});

describe('the rest of the player allowlist', () => {
  it('get_round_detail will not read a teammate’s round on the same team, and does not say it exists', async () => {
    const db = fakeDb({
      golf_rounds: [{ id: 'r-mate', player_id: 'teammate-a', team_id: 't', round_date: '2026-10-01', course_name: 'Secret Pines', total_score: 71, score_to_par: -1 }],
      golf_holes: [{ round_id: 'r-mate', hole_number: 1, par: 4, score: 3, putts: 1 }],
    });
    const asked = await run(db, 'get_round_detail', { round_id: 'r-mate' });
    const missing = await run(db, 'get_round_detail', { round_id: 'no-such-round' });
    expect(asked.wire).not.toContain('Secret Pines');
    expect(asked.result).toMatchObject({ summary: 'That round is not one of yours.', coverage: 'empty' });
    // The same answer as a round that does not exist: the id's existence is not told.
    expect(asked.result).toMatchObject({ summary: (missing.result as { summary?: string }).summary });
  });

  it('get_my_reads never says a guessed cause in a title, and sends no evidence', async () => {
    const db = fakeDb({
      golf_coach_insights: [
        { player_id: 'me', lifecycle_state: 'detected', title: 'Approach misses driven by long irons', category: 'approach', evidence: { metric_label: 'Greens from the fairway', cause: { state: 'inferred_hypothesis', alternatives: [{ label: 'From 175+ yards' }] }, diagnosis: { causality_level: 'inferred_hypothesis', root_cause: 'Long irons' } } },
        { player_id: 'me', lifecycle_state: 'detected', title: 'Trouble from 175+ yards', category: 'approach', evidence: { metric_label: 'Approach proximity', cause: { state: 'inferred_hypothesis', alternatives: [{ label: 'From 175+ yards' }] } } },
        { player_id: 'me', lifecycle_state: 'detected', title: 'Short side after long approach', category: 'approach', evidence: { metric_label: 'Scrambling', cause: { state: 'observed_sequence', path: ['Long approach'] }, diagnosis: { causality_level: 'observed_sequence', root_cause: 'Long approach then short side' } } },
      ],
    });
    const { result, wire } = await run(db, 'get_my_reads', {});
    expect(result.detail!.reads).toEqual([
      { title: 'Greens from the fairway', category: 'approach' },
      { title: 'Approach proximity', category: 'approach' },
      { title: 'Short side after long approach', category: 'approach' },
    ]);
    for (const leak of ['driven by', '175+', 'alternatives', 'root_cause']) expect(wire).not.toContain(leak);
  });
});
