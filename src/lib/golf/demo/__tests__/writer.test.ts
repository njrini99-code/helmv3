import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DEMO_TEAM_ID } from '@/lib/demo/config';
import type { Json } from '@/lib/types/database';
import { DEMO_TABLE_KEYS, DEMO_TABLES, generateDemoTeam, rowKey, type DemoDataset, type DemoRow, type DemoTable, type GenerateInput } from '../generate';
import {
  APPLY_BATCH,
  applyDemoWrite,
  DemoPlumbingMissingError,
  DemoTeamRefusedError,
  describePlan,
  FINISH_BATCH,
  FINISHED_ROUNDS,
  keyObject,
  planDemoWrite,
  rowHash,
  supabaseDemoPort,
  type DemoLedger,
  type DemoRoundToFinish,
  type DemoWriteItem,
  type DemoWritePort,
} from '../writer';

const OTHER_TEAM = '00000000-0000-4000-8000-0000000000e1';
const base: GenerateInput = {
  teamId: DEMO_TEAM_ID,
  today: '2026-11-15',
  timeZone: 'America/New_York',
  coachUserId: '00000000-0000-4000-8000-0000000000c1',
  coachId: '00000000-0000-4000-8000-0000000000c3',
  teamChannelId: '00000000-0000-4000-8000-0000000000c2',
};

const cache = new Map<string, DemoDataset>();
function gen(today = base.today): DemoDataset {
  const hit = cache.get(today);
  if (hit) return hit;
  const d = generateDemoTeam({ ...base, today });
  cache.set(today, d);
  return d;
}

/** A tiny dataset: one round with two holes and a shot, one event. */
function tiny(): DemoDataset {
  const tables = Object.fromEntries(DEMO_TABLES.map((t) => [t, [] as DemoRow[]])) as Record<DemoTable, DemoRow[]>;
  tables.golf_rounds.push({ id: 'r1', team_id: DEMO_TEAM_ID, player_id: 'p1', status: 'completed' });
  tables.golf_holes.push({ id: 'h1', round_id: 'r1', hole_number: 1, score: 4 }, { id: 'h2', round_id: 'r1', hole_number: 2, score: 5 });
  tables.golf_shots.push({ id: 's1', round_id: 'r1', hole_id: 'h1', shot_number: 1 });
  tables.golf_events.push({ id: 'e1', team_id: DEMO_TEAM_ID, title: 'Practice', description: undefined });
  tables.golf_team_seasons.push({ team_id: DEMO_TEAM_ID, season: '2026-27' });
  return { ...gen(), tables } as DemoDataset;
}

/** The ledger a database holds once a plan is fully written and finished. */
function ledgerAfter(dataset: DemoDataset): DemoLedger {
  const plan = planDemoWrite(dataset, {}, { full: true });
  const ledger: DemoLedger = {};
  for (const t of plan.tables) ledger[t.table] = Object.fromEntries(t.upserts.map((u) => [rowKey(t.table, u.row), u.hash]));
  ledger[FINISHED_ROUNDS] = Object.fromEntries(plan.roundsToFinish.map((r) => [r.id, r.hash]));
  return ledger;
}

/**
 * An in-memory database behind the four calls, keeping a ledger the way the
 * SQL functions do: apply skips a key that exists and is not in the ledger,
 * remove only drops ledger rows, finish records the finished hash.
 */
function fakeDb(preexisting: Partial<Record<DemoTable, DemoRow[]>> = {}) {
  const rows = new Map<DemoTable, Map<string, DemoRow>>(DEMO_TABLES.map((t) => [t, new Map()]));
  for (const [t, rs] of Object.entries(preexisting) as [DemoTable, DemoRow[]][]) for (const r of rs) rows.get(t)!.set(rowKey(t, r), r);
  const ledger: Record<string, Record<string, string>> = {};
  const calls: string[] = [];
  let finishedRounds = 0;
  const port: DemoWritePort = {
    async begin(teamId, opts) {
      if (teamId !== DEMO_TEAM_ID) throw new Error('refused');
      calls.push(`begin prune=${opts?.prune ?? true}`);
      let pruned = 0;
      if (opts?.prune ?? true) {
        for (const t of DEMO_TABLES) {
          for (const k of Object.keys(ledger[t] ?? {})) {
            if (!rows.get(t)!.has(k)) {
              delete ledger[t]![k];
              pruned += 1;
            }
          }
        }
      }
      return { pruned, ledger: structuredClone(ledger) as DemoLedger };
    },
    async apply(teamId, table, items, version) {
      calls.push(`apply ${table} ${items.length} v${version}`);
      const skipped: string[] = [];
      let written = 0;
      for (const { hash, row } of items) {
        const k = rowKey(table, row);
        if (rows.get(table)!.has(k) && !ledger[table]?.[k]) {
          skipped.push(k);
          continue;
        }
        rows.get(table)!.set(k, row);
        (ledger[table] ??= {})[k] = hash;
        written += 1;
      }
      return { written, skipped };
    },
    async remove(teamId, table, keys) {
      calls.push(`remove ${table} ${keys.length}`);
      let removed = 0;
      for (const key of keys) {
        const k = DEMO_TABLE_KEYS[table].map((c) => String(key[c])).join('|');
        if (!ledger[table]?.[k]) continue;
        rows.get(table)!.delete(k);
        delete ledger[table]![k];
        removed += 1;
      }
      return removed;
    },
    async finishRounds(teamId, rounds, version) {
      calls.push(`finish ${rounds.length} v${version}`);
      for (const r of rounds) (ledger[FINISHED_ROUNDS] ??= {})[r.id] = r.hash;
      finishedRounds += rounds.length;
      return rounds.length;
    },
  };
  return { port, rows, ledger, calls, finished: () => finishedRounds };
}

describe('the demo team guard', () => {
  it('refuses another team before anything is sent', async () => {
    const d = { ...tiny(), teamId: OTHER_TEAM };
    expect(() => planDemoWrite(d, {})).toThrow(DemoTeamRefusedError);
    const db = fakeDb();
    const plan = { ...planDemoWrite(tiny(), {}), teamId: OTHER_TEAM };
    await expect(applyDemoWrite(db.port, plan)).rejects.toThrow(DemoTeamRefusedError);
    expect(db.calls).toEqual([]);
  });
});

describe('planDemoWrite', () => {
  it('writes every row and finishes every round the first time', () => {
    const plan = planDemoWrite(tiny(), {});
    const by = Object.fromEntries(plan.tables.map((t) => [t.table, t]));
    expect(by.golf_rounds!.upserts).toHaveLength(1);
    expect(by.golf_holes!.upserts).toHaveLength(2);
    expect(plan.tables.every((t) => t.removes.length === 0 && t.unchanged === 0)).toBe(true);
    expect(plan.roundsToFinish.map((r) => r.id)).toEqual(['r1']);
  });

  it('sends nothing when the ledger matches, and finishes a round a stopped run left unfinished', () => {
    const d = tiny();
    const ledger = ledgerAfter(d);
    const same = planDemoWrite(d, ledger);
    expect(same.tables.every((t) => t.upserts.length === 0 && t.removes.length === 0)).toBe(true);
    expect(same.roundsToFinish).toEqual([]);

    const stopped = { ...ledger, [FINISHED_ROUNDS]: {} };
    const resumed = planDemoWrite(d, stopped);
    expect(resumed.tables.every((t) => t.upserts.length === 0)).toBe(true);
    expect(resumed.roundsToFinish.map((r) => r.id)).toEqual(['r1']);
  });

  it('re-sends only a changed hole and finishes its round again', () => {
    const d = tiny();
    const ledger = ledgerAfter(d);
    const changed = structuredClone(d);
    changed.tables.golf_holes[1]!.score = 6;
    const plan = planDemoWrite(changed, ledger);
    const sent = plan.tables.flatMap((t) => t.upserts.map((u) => `${t.table}:${rowKey(t.table, u.row)}`));
    expect(sent).toEqual(['golf_holes:h2']);
    expect(plan.roundsToFinish.map((r) => r.id)).toEqual(['r1']);
    expect(plan.roundsToFinish[0]!.hash).not.toBe(ledger[FINISHED_ROUNDS]!.r1);
  });

  it('removes rows it wrote before that the team no longer has, by their whole key', () => {
    const d = tiny();
    const ledger = ledgerAfter(d);
    ledger.golf_team_seasons = { ...ledger.golf_team_seasons, [`${DEMO_TEAM_ID}|2025-26`]: 'x' };
    ledger.golf_events = { ...ledger.golf_events, gone: 'y' };
    const plan = planDemoWrite(d, ledger);
    const by = Object.fromEntries(plan.tables.map((t) => [t.table, t]));
    expect(by.golf_team_seasons!.removes).toEqual([{ team_id: DEMO_TEAM_ID, season: '2025-26' }]);
    expect(by.golf_events!.removes).toEqual([{ id: 'gone' }]);
  });

  it('re-sends everything with full', () => {
    const d = tiny();
    const plan = planDemoWrite(d, ledgerAfter(d), { full: true });
    expect(plan.tables.reduce((n, t) => n + t.upserts.length, 0)).toBe(6);
    expect(plan.roundsToFinish).toHaveLength(1);
  });

  it('refuses a dataset with two rows under one key', () => {
    const d = tiny();
    d.tables.golf_holes.push({ ...d.tables.golf_holes[0]! });
    expect(() => planDemoWrite(d, {})).toThrow(/two golf_holes rows with the key h1/);
  });

  it('hashes a row the same whatever the key order, and skips undefined fields', () => {
    expect(rowHash({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(rowHash({ b: { d: [1, 2], c: 2 }, a: 1 }));
    expect(rowHash({ a: 1, b: undefined })).toBe(rowHash({ a: 1 }));
    expect(rowHash({ a: 1 })).not.toBe(rowHash({ a: 2 }));
  });

  it('turns a ledger key back into the primary key, and refuses a malformed one', () => {
    expect(keyObject('golf_tournament_entries', 't1|p1')).toEqual({ tournament_id: 't1', player_id: 'p1' });
    expect(() => keyObject('golf_tournament_entries', 't1')).toThrow(/expected 2/);
  });
});

describe('applyDemoWrite', () => {
  it('removes children before parents, writes parents before children, then finishes rounds', async () => {
    const d = tiny();
    const ledger = ledgerAfter(d);
    ledger.golf_rounds = { ...ledger.golf_rounds, old: 'x' };
    ledger.golf_holes = { ...ledger.golf_holes, oldhole: 'x' };
    const changed = structuredClone(d);
    changed.tables.golf_holes[0]!.score = 3;
    changed.tables.golf_events[0]!.title = 'Qualifying';
    const calls: string[] = [];
    const port: DemoWritePort = {
      begin: vi.fn(),
      apply: async (_t, table, items) => (calls.push(`apply ${table}`), { written: items.length, skipped: [] }),
      remove: async (_t, table, keys) => (calls.push(`remove ${table}`), keys.length),
      finishRounds: async (_t, rounds) => (calls.push(`finish ${rounds.map((r) => r.id).join(',')}`), rounds.length),
    };
    const result = await applyDemoWrite(port, planDemoWrite(changed, ledger));
    expect(calls).toEqual(['remove golf_holes', 'remove golf_rounds', 'apply golf_events', 'apply golf_holes', 'finish r1']);
    expect(result.roundsFinished).toBe(1);
  });

  it('batches big tables, one column set per call, without undefined fields', async () => {
    const d = tiny();
    d.tables.golf_shots = Array.from({ length: APPLY_BATCH * 2 + 3 }, (_, i) => ({
      id: `s${i}`,
      round_id: 'r1',
      hole_id: 'h1',
      shot_number: i + 1,
      ...(i % 2 ? { lie: 'fairway' } : { lie: undefined }),
    }));
    const batches: DemoWriteItem[][] = [];
    const port: DemoWritePort = {
      begin: vi.fn(),
      apply: async (_t, table, items) => {
        if (table === 'golf_shots') batches.push(items);
        return { written: items.length, skipped: [] };
      },
      remove: async () => 0,
      finishRounds: async (_t, rounds) => rounds.length,
    };
    await applyDemoWrite(port, planDemoWrite(d, {}));
    expect(batches.every((b) => b.length <= APPLY_BATCH)).toBe(true);
    expect(batches.reduce((n, b) => n + b.length, 0)).toBe(APPLY_BATCH * 2 + 3);
    for (const b of batches) {
      const sigs = new Set(b.map((i) => Object.keys(i.row).sort().join(',')));
      expect(sigs.size).toBe(1);
      expect(b.every((i) => Object.values(i.row).every((v) => v !== undefined))).toBe(true);
    }
  });

  it('finishes rounds in batches and sends the generator version', async () => {
    const d = tiny();
    d.tables.golf_rounds = Array.from({ length: FINISH_BATCH + 5 }, (_, i) => ({ id: `r${String(i).padStart(2, '0')}`, team_id: DEMO_TEAM_ID }));
    const sent: Array<{ rounds: DemoRoundToFinish[]; version: number }> = [];
    const port: DemoWritePort = {
      begin: vi.fn(),
      apply: async (_t, _table, items) => ({ written: items.length, skipped: [] }),
      remove: async () => 0,
      finishRounds: async (_t, rounds, version) => (sent.push({ rounds, version }), rounds.length),
    };
    const result = await applyDemoWrite(port, planDemoWrite(d, {}));
    expect(sent.map((s) => s.rounds.length)).toEqual([FINISH_BATCH, 5]);
    expect(sent.every((s) => s.version === d.version)).toBe(true);
    expect(result.roundsFinished).toBe(FINISH_BATCH + 5);
  });

  it('reports rows the database kept instead of removing', async () => {
    const d = tiny();
    const ledger = ledgerAfter(d);
    ledger.golf_rounds = { ...ledger.golf_rounds, kept: 'x' };
    const lines: string[] = [];
    const port: DemoWritePort = {
      begin: vi.fn(),
      apply: async (_t, _table, items) => ({ written: items.length, skipped: [] }),
      remove: async () => 0,
      finishRounds: async (_t, rounds) => rounds.length,
    };
    await applyDemoWrite(port, planDemoWrite(d, ledger), (l) => lines.push(l));
    expect(lines).toContain('removed 0 golf_rounds (1 were kept by the database and stay in the ledger)');
  });
});

describe('writing the generated team day after day (fake database)', () => {
  it('writes once, then only what a new day changes, then nothing', async () => {
    const db = fakeDb();
    const first = gen('2026-11-15');
    const r1 = await applyDemoWrite(db.port, planDemoWrite(first, (await db.port.begin(DEMO_TEAM_ID)).ledger));
    expect(r1.tables.reduce((n, t) => n + t.upserted, 0)).toBe(Object.values(first.tables).reduce((n, rs) => n + rs.length, 0));
    expect(r1.roundsFinished).toBe(first.tables.golf_rounds.length);

    const again = planDemoWrite(first, (await db.port.begin(DEMO_TEAM_ID)).ledger);
    expect(again.tables.every((t) => !t.upserts.length && !t.removes.length)).toBe(true);
    expect(again.roundsToFinish).toEqual([]);

    const next = gen('2026-11-23');
    const plan = planDemoWrite(next, (await db.port.begin(DEMO_TEAM_ID)).ledger);
    const sent = plan.tables.reduce((n, t) => n + t.upserts.length, 0);
    const total = Object.values(next.tables).reduce((n, rs) => n + rs.length, 0);
    expect(sent).toBeGreaterThan(0);
    expect(sent).toBeLessThan(total / 4);
    // Past rounds keep their hash (DD-04): only rounds new this week are finished.
    const before = new Set(first.tables.golf_rounds.map((r) => String(r.id)));
    expect(plan.roundsToFinish.every((r) => !before.has(r.id))).toBe(true);
    await applyDemoWrite(db.port, plan);
    for (const t of DEMO_TABLES) expect(db.rows.get(t)!.size, t).toBe(next.tables[t].length);
  });

  it('never overwrites a row it did not write, and leaves it out of the ledger', async () => {
    const d = gen('2026-11-15');
    const foreign = { ...d.tables.golf_events[0]!, title: 'Written by a coach' };
    const db = fakeDb({ golf_events: [foreign] });
    const result = await applyDemoWrite(db.port, planDemoWrite(d, {}));
    const events = result.tables.find((t) => t.table === 'golf_events')!;
    expect(events.skipped).toEqual([String(foreign.id)]);
    expect(db.rows.get('golf_events')!.get(String(foreign.id))!.title).toBe('Written by a coach');
    expect(db.ledger.golf_events![String(foreign.id)]).toBeUndefined();
  });

  it('reads without pruning on a dry run', async () => {
    const db = fakeDb();
    await db.port.begin(DEMO_TEAM_ID, { prune: false });
    expect(db.calls).toEqual(['begin prune=false']);
  });
});

describe('the database side agrees with the writer', () => {
  const sql = readFileSync(path.join(process.cwd(), 'supabase/migrations/20261115210000_golf_demo_generator.sql'), 'utf8');

  it('lets the generator write exactly the tables it generates', () => {
    const body = sql.slice(sql.indexOf('FUNCTION helm_private.golf_demo_tables()'));
    const list = body.slice(body.indexOf('ARRAY['), body.indexOf(']::text[]'));
    const tables = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(tables).toEqual([...DEMO_TABLES]);
  });

  it('records finished rounds under the name the writer reads', () => {
    expect(sql).toContain(`'${FINISHED_ROUNDS}'`);
  });
});

describe('supabaseDemoPort', () => {
  it('calls the four functions with their argument names', async () => {
    const rpc = vi.fn(async (fn: string) => ({
      data:
        fn === 'golf_demo_begin'
          ? { pruned: 2, tables: { golf_events: { e1: 'h' } } }
          : fn === 'golf_demo_apply'
            ? { written: 1, skipped: ['k'] }
            : 3,
      error: null,
    }));
    const port = supabaseDemoPort({ rpc });
    expect(await port.begin(DEMO_TEAM_ID, { prune: false })).toEqual({ pruned: 2, ledger: { golf_events: { e1: 'h' } } });
    expect(await port.apply(DEMO_TEAM_ID, 'golf_events', [{ hash: 'h', row: { id: 'e1' } }], 4)).toEqual({ written: 1, skipped: ['k'] });
    expect(await port.remove(DEMO_TEAM_ID, 'golf_events', [{ id: 'e1' } as Record<string, Json>])).toBe(3);
    expect(await port.finishRounds(DEMO_TEAM_ID, [{ id: 'r1', hash: 'h' }], 4)).toBe(3);
    expect(rpc.mock.calls).toEqual([
      ['golf_demo_begin', { p_team: DEMO_TEAM_ID, p_prune: false }],
      ['golf_demo_apply', { p_team: DEMO_TEAM_ID, p_table: 'golf_events', p_items: [{ hash: 'h', row: { id: 'e1' } }], p_version: 4 }],
      ['golf_demo_remove', { p_team: DEMO_TEAM_ID, p_table: 'golf_events', p_keys: [{ id: 'e1' }] }],
      ['golf_demo_finish_rounds', { p_team: DEMO_TEAM_ID, p_rounds: [{ id: 'r1', hash: 'h' }], p_version: 4 }],
    ]);
  });

  it('says the migration is missing when the functions are not there', async () => {
    const port = supabaseDemoPort({ rpc: async () => ({ data: null, error: { message: 'Could not find the function public.golf_demo_begin', code: 'PGRST202' } }) });
    await expect(port.begin(DEMO_TEAM_ID)).rejects.toThrow(DemoPlumbingMissingError);
  });

  it('passes other database errors through with their code', async () => {
    const port = supabaseDemoPort({ rpc: async () => ({ data: null, error: { message: 'golf_demo_apply: refused', code: 'P0001' } }) });
    await expect(port.apply(DEMO_TEAM_ID, 'golf_events', [], 1)).rejects.toThrow('golf_demo_apply failed: golf_demo_apply: refused (P0001)');
  });
});

describe('describePlan', () => {
  it('lists only tables with something to do', () => {
    const text = describePlan(planDemoWrite(tiny(), {}));
    expect(text).toContain('| golf_holes | 2 | 0 | 0 |');
    expect(text).not.toContain('golf_messages');
    expect(text).toContain('Rounds to recompute: 1.');
  });
});
