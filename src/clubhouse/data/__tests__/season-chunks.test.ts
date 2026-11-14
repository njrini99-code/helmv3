import { afterEach, describe, expect, it, vi } from 'vitest';
import { readWaves } from '../../__tests__/read-waves';
import type { ChFakeTables } from '../../__tests__/supabase-fake';
import { fakeServer } from '../../__tests__/supabase-fake';

/**
 * F-0013: `loadSeasonRounds` reads a big roster in 200-id slices. The slices are independent, so a few go at once instead of one after
 * another; the order, the per-slice paging past PostgREST's 1000-row cap, and the failed-read state are as they were.
 */

vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));

import { chLogServer } from '../../lib/track-server';
import { loadSeasonRounds, SEASON_CHUNKS_AT_ONCE } from '../season';

const tables = { current: {} as ChFakeTables, gate: undefined as ((t: string) => Promise<void> | void) | undefined };
const client = async () => (await fakeServer(tables).createClient()) as unknown as Parameters<typeof loadSeasonRounds>[0];

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${String(i).padStart(4, '0')}`);
const round = (player_id: string, n: number, date = '2026-10-01') => ({ id: `r-${player_id}-${n}`, player_id, round_date: date, total_score: 80, front_nine: 40, back_nine: 40, holes_played: 18, total_putts: 31 });
type Filters = Array<[string, unknown[]]>;
const arg = (f: Filters, name: string) => f.find(([k]) => k === name)?.[1];
const asked = (f: Filters) => (arg(f, 'in') as [string, string[]])[1];
const range = (f: Filters) => arg(f, 'range') as [number, number];

afterEach(() => {
  tables.current = {};
  tables.gate = undefined;
  vi.mocked(chLogServer).mockClear();
});

describe('F-0013 loadSeasonRounds reads its id slices side by side', () => {
  it('1000 players are five 200-id slices: the first four go together, then the fifth (sequentially it would be five waves of one)', async () => {
    const waves = readWaves();
    tables.gate = waves.gate;
    tables.current = { golf_rounds: (f) => ({ data: asked(f).map((p) => round(p, 1)) }) };
    const { result, waves: depth } = await waves.run(loadSeasonRounds(await client(), ids(1000), { surface: 'test', since: null }));
    expect(depth.map((w) => w.length)).toEqual([SEASON_CHUNKS_AT_ONCE, 1]);
    expect(result.error).toBe(false);
    expect(result.rounds).toHaveLength(1000);
  });

  it('answers in the order the sequential loop gave: newest first, ties by id, whichever slice answers first', async () => {
    const all = ids(600);
    const slow = (t: string) => (t === 'golf_rounds' ? new Promise<void>((r) => setTimeout(r, 0)) : undefined);
    tables.gate = slow;
    tables.current = {
      golf_rounds: (f) => ({ data: asked(f).map((p, i) => round(p, 1, i % 2 ? '2026-10-02' : '2026-10-01')) }),
    };
    const { rounds } = await loadSeasonRounds(await client(), all, { surface: 'test', since: null });
    expect(rounds).toHaveLength(600);
    const sorted = [...rounds].sort((a, b) => (a.round_date < b.round_date ? 1 : a.round_date > b.round_date ? -1 : a.id.localeCompare(b.id)));
    expect(rounds.map((r) => r.id)).toEqual(sorted.map((r) => r.id));
  });

  it('a slice that fills a 1000-row page is paged on its own: the second page is asked for, and every row comes back once', async () => {
    const seen: Array<[number, number]> = [];
    tables.current = {
      golf_rounds: (f) => {
        const [from, to] = range(f);
        const who = asked(f);
        // The first slice has 1005 rounds in all (past the cap), the others one each.
        if (who[0] !== 'p0000') return { data: who.map((p) => round(p, 1)) };
        seen.push([from, to]);
        const rows = Array.from({ length: 1005 }, (_, i) => round('p0000', i));
        return { data: rows.slice(from, to + 1) };
      },
    };
    const { rounds, error } = await loadSeasonRounds(await client(), ids(400), { surface: 'test', since: null });
    expect(error).toBe(false);
    expect(seen).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(rounds).toHaveLength(1005 + 200);
    expect(new Set(rounds.map((r) => r.id)).size).toBe(rounds.length);
  });

  it('a failed slice is the whole read failing (logged once), as before: no partial season', async () => {
    tables.current = { golf_rounds: (f) => (asked(f)[0] === 'p0200' ? { error: { message: 'boom' } } : { data: asked(f).map((p) => round(p, 1)) }) };
    const res = await loadSeasonRounds(await client(), ids(800), { surface: 'test', since: null });
    expect(res).toEqual({ rounds: [], error: true });
    expect(chLogServer).toHaveBeenCalledTimes(1);
    expect(chLogServer).toHaveBeenCalledWith('test', 'rounds', expect.anything());
  });

  it('a small roster is one read, and none is none', async () => {
    const waves = readWaves();
    tables.gate = waves.gate;
    tables.current = { golf_rounds: (f) => ({ data: asked(f).map((p) => round(p, 1)) }) };
    const { waves: depth, result } = await waves.run(loadSeasonRounds(await client(), ids(30), { surface: 'test', since: null }));
    expect(depth).toEqual([['golf_rounds']]);
    expect(result.rounds).toHaveLength(30);
    expect(await loadSeasonRounds(await client(), [], { surface: 'test', since: null })).toEqual({ rounds: [], error: false });
  });
});
