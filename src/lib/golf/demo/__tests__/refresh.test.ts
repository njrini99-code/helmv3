import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEMO_TEAM_ID } from '@/lib/demo/config';
import type { Database } from '@/lib/types/database';
import { DEMO_TABLE_KEYS, DEMO_TABLES, rowKey, type DemoRow, type DemoTable } from '../generate';
import { loadDemoContext, localDate, refreshDemoTeam } from '../refresh';
import { readDemoSnapshot } from '../snapshot';
import { DemoTeamRefusedError, FINISHED_ROUNDS } from '../writer';

/**
 * The refresh end to end against an in-memory stand-in for Supabase: the
 * PostgREST reads the context and the snapshot make (eq, in, order, range,
 * limit, maybeSingle) and the four generator functions, keeping a ledger the
 * way the SQL does. The SQL itself is covered by
 * supabase/tests/rls/golf_demo_generator.sql.
 */

const COACH_LOGIN = '00000000-0000-4000-8000-0000000000c1';
const COACH_ROW = '00000000-0000-4000-8000-0000000000c3';
const OTHER_COACH_LOGIN = '00000000-0000-4000-8000-0000000000c5';
const OTHER_COACH_ROW = '00000000-0000-4000-8000-0000000000c6';
const CHANNEL = '00000000-0000-4000-8000-0000000000c2';

type Rows = Record<string, DemoRow[]>;

function fakeSupabase(seed: Rows) {
  const tables: Rows = structuredClone(seed);
  const ledger: Record<string, Record<string, string>> = {};
  const calls: string[] = [];
  const rows = (t: string) => (tables[t] ??= []);

  class Query implements PromiseLike<{ data: unknown; error: null }> {
    private filters: Array<(r: DemoRow) => boolean> = [];
    private sort: { col: string; asc: boolean } | null = null;
    private window: [number, number] | null = null;
    private one = false;
    constructor(private table: string) {}
    select() {
      return this;
    }
    eq(col: string, v: unknown) {
      this.filters.push((r) => r[col] === v);
      return this;
    }
    in(col: string, vs: unknown[]) {
      const set = new Set(vs.map(String));
      this.filters.push((r) => set.has(String(r[col])));
      return this;
    }
    order(col: string, opts?: { ascending?: boolean }) {
      this.sort = { col, asc: opts?.ascending !== false };
      return this;
    }
    limit(n: number) {
      this.window = [0, n - 1];
      return this;
    }
    range(from: number, to: number) {
      this.window = [from, to];
      return this;
    }
    maybeSingle() {
      this.one = true;
      return this;
    }
    private run() {
      let out = rows(this.table).filter((r) => this.filters.every((f) => f(r)));
      if (this.sort) {
        const { col, asc } = this.sort;
        out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
      }
      if (this.window) out = out.slice(this.window[0], this.window[1] + 1);
      return { data: this.one ? (out[0] ?? null) : out, error: null };
    }
    then<A, B>(ok?: ((v: { data: unknown; error: null }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
      return Promise.resolve(this.run()).then(ok, bad);
    }
  }

  async function rpc(fn: string, args: Record<string, unknown>) {
    calls.push(fn);
    if (args.p_team !== DEMO_TEAM_ID) return { data: null, error: { message: 'refusing team', code: '42501' } };
    if (fn === 'golf_demo_begin') {
      let pruned = 0;
      if (args.p_prune !== false) {
        for (const t of DEMO_TABLES) {
          const live = new Set(rows(t).map((r) => rowKey(t, r)));
          for (const k of Object.keys(ledger[t] ?? {})) {
            if (live.has(k)) continue;
            delete ledger[t]![k];
            pruned += 1;
          }
        }
      }
      return { data: { pruned, tables: structuredClone(ledger) }, error: null };
    }
    if (fn === 'golf_demo_apply') {
      const table = args.p_table as DemoTable;
      const skipped: string[] = [];
      let written = 0;
      for (const { hash, row } of args.p_items as Array<{ hash: string; row: DemoRow }>) {
        const k = rowKey(table, row);
        const at = rows(table).findIndex((r) => rowKey(table, r) === k);
        if (at >= 0 && !ledger[table]?.[k]) {
          skipped.push(k);
          continue;
        }
        if (at >= 0) rows(table)[at] = row;
        else rows(table).push(row);
        (ledger[table] ??= {})[k] = hash;
        written += 1;
      }
      return { data: { written, skipped }, error: null };
    }
    if (fn === 'golf_demo_remove') {
      const table = args.p_table as DemoTable;
      let removed = 0;
      for (const key of args.p_keys as DemoRow[]) {
        const k = DEMO_TABLE_KEYS[table].map((c) => String(key[c])).join('|');
        if (!ledger[table]?.[k]) continue;
        tables[table] = rows(table).filter((r) => rowKey(table, r) !== k);
        delete ledger[table]![k];
        removed += 1;
      }
      return { data: removed, error: null };
    }
    if (fn === 'golf_demo_finish_rounds') {
      const rounds = args.p_rounds as Array<{ id: string; hash: string }>;
      for (const r of rounds) (ledger[FINISHED_ROUNDS] ??= {})[r.id] = r.hash;
      return { data: rounds.length, error: null };
    }
    return { data: null, error: { message: `Could not find the function public.${fn}`, code: 'PGRST202' } };
  }

  const client = { from: (t: string) => new Query(t), rpc } as unknown as SupabaseClient<Database>;
  return { client, tables, ledger, calls };
}

function demoTeamSeed(): Rows {
  return {
    golf_team_settings: [{ team_id: DEMO_TEAM_ID, timezone: 'America/Chicago' }],
    golf_team_coach_staff: [
      { team_id: DEMO_TEAM_ID, coach_id: OTHER_COACH_ROW, is_primary: true },
      { team_id: DEMO_TEAM_ID, coach_id: COACH_ROW, is_primary: false },
    ],
    golf_coaches: [
      { id: OTHER_COACH_ROW, user_id: OTHER_COACH_LOGIN, email: 'head@example.test' },
      { id: COACH_ROW, user_id: COACH_LOGIN, email: 'Demo@Example.test' },
    ],
    golf_conversations: [{ id: CHANNEL, team_id: DEMO_TEAM_ID, is_team_channel: true, created_at: '2026-08-01T00:00:00Z' }],
  };
}

const NOW = new Date('2026-11-15T18:00:00Z');

describe('localDate', () => {
  it('is the date in the team zone, not UTC', () => {
    expect(localDate(new Date('2026-11-16T03:00:00Z'), 'America/Los_Angeles')).toBe('2026-11-15');
    expect(localDate(new Date('2026-11-16T03:00:00Z'), 'UTC')).toBe('2026-11-16');
  });
});

describe('loadDemoContext', () => {
  it('writes as the shared demo login when it is on the team, and finds the team channel', async () => {
    const { client } = fakeSupabase(demoTeamSeed());
    const ctx = await loadDemoContext(client, DEMO_TEAM_ID, ' demo@example.TEST ');
    expect(ctx).toEqual({ teamId: DEMO_TEAM_ID, timeZone: 'America/Chicago', coachUserId: COACH_LOGIN, coachId: COACH_ROW, teamChannelId: CHANNEL });
  });

  it('falls back to the primary coach', async () => {
    const { client } = fakeSupabase(demoTeamSeed());
    const ctx = await loadDemoContext(client, DEMO_TEAM_ID, null);
    expect(ctx.coachId).toBe(OTHER_COACH_ROW);
    expect(ctx.coachUserId).toBe(OTHER_COACH_LOGIN);
  });

  it('refuses any other team before it reads', async () => {
    const { client, calls } = fakeSupabase(demoTeamSeed());
    await expect(loadDemoContext(client, '00000000-0000-4000-8000-0000000000e1')).rejects.toThrow(DemoTeamRefusedError);
    expect(calls).toEqual([]);
  });

  it('refuses a team with no coach to write as', async () => {
    const { client } = fakeSupabase({ ...demoTeamSeed(), golf_team_coach_staff: [] });
    await expect(loadDemoContext(client, DEMO_TEAM_ID)).rejects.toThrow(/no coach/);
  });
});

describe('refreshDemoTeam', () => {
  it('a dry run reads the ledger without pruning and writes nothing', async () => {
    const db = fakeSupabase(demoTeamSeed());
    const report = await refreshDemoTeam(db.client, { now: NOW, demoCoachEmail: 'demo@example.test' });
    expect(report.applied).toBe(false);
    expect(report.result).toBeNull();
    expect(db.calls).toEqual(['golf_demo_begin']);
    expect(db.tables.golf_rounds ?? []).toEqual([]);
    expect(report.text).toContain('Would write (dry run, nothing sent):');
    expect(report.plan.roundsToFinish.length).toBe(report.dataset.tables.golf_rounds.length);
  });

  it('writes the team, reads it back clean, and the next run sends nothing', async () => {
    const db = fakeSupabase(demoTeamSeed());
    const first = await refreshDemoTeam(db.client, { now: NOW, apply: true, demoCoachEmail: 'demo@example.test' });
    expect(first.today).toBe('2026-11-15');
    expect(first.result!.roundsFinished).toBe(first.dataset.tables.golf_rounds.length);
    expect(first.written!.ok).toBe(true);
    expect(first.written!.errors).toBe(0);
    for (const t of ['golf_rounds', 'golf_holes', 'golf_shots', 'golf_events'] as const) {
      expect(db.tables[t]!.length, t).toBe(first.dataset.tables[t].length);
    }

    const again = await refreshDemoTeam(db.client, { now: NOW, apply: true, demoCoachEmail: 'demo@example.test' });
    expect(again.plan.tables.every((t) => !t.upserts.length && !t.removes.length)).toBe(true);
    expect(again.plan.roundsToFinish).toEqual([]);
  });

  it('reads back rows it did not write, so the check sees what a prospect sees', async () => {
    const db = fakeSupabase({
      ...demoTeamSeed(),
      golf_team_members: [{ id: 'm-test', team_id: DEMO_TEAM_ID, player_id: 'p-test', status: 'active' }],
      golf_players: [{ id: 'p-test', first_name: 'Audit', last_name: 'Testplayer', is_test: true }],
    });
    await refreshDemoTeam(db.client, { now: NOW, apply: true, demoCoachEmail: 'demo@example.test' });
    const snap = await readDemoSnapshot(db.client, DEMO_TEAM_ID, '2026-11-15');
    expect(snap.tables.golf_players!.some((p) => p.id === 'p-test')).toBe(true);
    expect(snap.tables.golf_team_members!.length).toBe(10);
  });
});
