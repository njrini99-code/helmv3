/**
 * Writes the generated demo team (DD-01) to the database, the demo team only.
 *
 * The generator (`generate.ts`) describes the whole team as of a day. The
 * writer compares that with a ledger of what it wrote before
 * (`helm_private.golf_demo_ledger`, one hash per row) and sends only the
 * difference: rows that are new or changed, and rows it wrote before that the
 * team no longer has. Everything goes through four functions of migration
 * 20261115211000, which run as the owner, are callable by the service role
 * only and refuse every team but `DEMO_TEAM_ID`:
 *
 *   golf_demo_begin          drops ledger rows whose table row is gone, returns the ledger
 *   golf_demo_apply          upserts one table's rows; skips (and returns) a key it did not write
 *   golf_demo_remove         deletes rows it wrote
 *   golf_demo_finish_rounds  totals, stats cache and strokes gained for the rounds it wrote,
 *                            recorded in the ledger as finished
 *
 * This module refuses any other team before it sends anything, so the guard
 * holds twice. Nothing here reads a clock: the caller passes the day.
 */
import { createHash } from 'node:crypto';
import { DEMO_TEAM_ID } from '@/lib/demo/config';
import type { Json } from '@/lib/types/database';
import { DEMO_TABLE_KEYS, DEMO_TABLES, rowKey, type DemoDataset, type DemoRow, type DemoTable } from './generate';

/**
 * The ledger entry for finished rounds: round id to the hash of the round with
 * its holes and shots when it was last finished. A run that stops after the
 * upserts and before the finish leaves these behind, and the next run
 * finishes those rounds even though their rows have not changed.
 */
export const FINISHED_ROUNDS = 'golf_rounds#finished';

/** What the database keeps: per table, row key to the hash of what was written. */
export type DemoLedger = Partial<Record<DemoTable | typeof FINISHED_ROUNDS, Record<string, string>>>;

/** A round to finish and the hash recorded once it is. */
export interface DemoRoundToFinish {
  id: string;
  hash: string;
}

/** One upsert: the row and its hash. */
export interface DemoWriteItem {
  hash: string;
  row: DemoRow;
}

/** The four database calls the writer makes. `supabaseDemoPort` is the real one; tests use a fake. */
export interface DemoWritePort {
  /** `prune: false` reads the ledger without changing it (a dry run). */
  begin(teamId: string, opts?: { prune?: boolean }): Promise<{ pruned: number; ledger: DemoLedger }>;
  apply(teamId: string, table: DemoTable, items: DemoWriteItem[], version: number): Promise<{ written: number; skipped: string[] }>;
  remove(teamId: string, table: DemoTable, keys: Array<Record<string, Json>>): Promise<number>;
  finishRounds(teamId: string, rounds: DemoRoundToFinish[], version: number): Promise<number>;
}

export interface DemoTablePlan {
  table: DemoTable;
  upserts: DemoWriteItem[];
  /** Primary-key objects of rows the generator wrote before and no longer has. */
  removes: Array<Record<string, Json>>;
  unchanged: number;
}

export interface DemoWritePlan {
  teamId: string;
  version: number;
  tables: DemoTablePlan[];
  /**
   * Rounds whose header, holes or shots changed since they were last finished
   * (or that never were): their totals and stats are recomputed after the write.
   */
  roundsToFinish: DemoRoundToFinish[];
}

export interface DemoWriteResult {
  tables: Array<{ table: DemoTable; upserted: number; skipped: string[]; removed: number; unchanged: number }>;
  roundsFinished: number;
}

/** Rows per apply call; the database refuses more than 2000. */
export const APPLY_BATCH = 500;
/** Keys per remove call; the database refuses more than 5000. */
export const REMOVE_BATCH = 1000;
/** Rounds per finish call; the database refuses more than 50. */
export const FINISH_BATCH = 20;

export class DemoTeamRefusedError extends Error {
  constructor(teamId: string) {
    super(`The demo generator writes the demo team only (${DEMO_TEAM_ID}), not ${teamId}.`);
    this.name = 'DemoTeamRefusedError';
  }
}

/** The database functions are missing: migration 20261115211000 is not applied where this ran. */
export class DemoPlumbingMissingError extends Error {
  constructor(detail: string) {
    super(`The demo generator's database functions are not there (apply supabase/migrations/20261115211000_golf_demo_generator.sql first): ${detail}`);
    this.name = 'DemoPlumbingMissingError';
  }
}

export function assertDemoTeam(teamId: string): void {
  if (teamId !== DEMO_TEAM_ID) throw new DemoTeamRefusedError(teamId);
}

/** JSON with keys in a fixed order, so one row always hashes the same. */
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
}

export function rowHash(row: DemoRow | unknown[]): string {
  return createHash('sha256').update(stableJson(row)).digest('hex').slice(0, 24);
}

/** A ledger key back to the primary-key object the remove call takes. */
export function keyObject(table: DemoTable, key: string): Record<string, Json> {
  const cols = DEMO_TABLE_KEYS[table];
  const parts = key.split('|');
  if (parts.length !== cols.length) throw new Error(`A ${table} ledger key has ${parts.length} parts, expected ${cols.length}: ${key}`);
  return Object.fromEntries(cols.map((c, i) => [c, parts[i]!]));
}

/**
 * The difference between the generated team and the ledger. `full` re-sends
 * every row (after a hand edit, or when the ledger is in doubt); the default
 * sends only new and changed rows.
 */
export function planDemoWrite(dataset: DemoDataset, ledger: DemoLedger, opts: { full?: boolean } = {}): DemoWritePlan {
  assertDemoTeam(dataset.teamId);
  const tables: DemoTablePlan[] = [];
  // Per round: its own hash, then its holes' and shots' hashes.
  const parts = new Map<string, { round: string; children: string[] }>();
  const partsOf = (id: string) => {
    let p = parts.get(id);
    if (!p) parts.set(id, (p = { round: '', children: [] }));
    return p;
  };
  for (const table of DEMO_TABLES) {
    const had = ledger[table] ?? {};
    const seen = new Set<string>();
    const upserts: DemoWriteItem[] = [];
    let unchanged = 0;
    for (const row of dataset.tables[table]) {
      const key = rowKey(table, row);
      if (seen.has(key)) throw new Error(`The generator produced two ${table} rows with the key ${key}.`);
      seen.add(key);
      const hash = rowHash(row);
      if (table === 'golf_rounds') partsOf(String(row.id)).round = hash;
      if (table === 'golf_holes' || table === 'golf_shots') partsOf(String(row.round_id)).children.push(`${table}:${hash}`);
      if (!opts.full && had[key] === hash) {
        unchanged += 1;
        continue;
      }
      upserts.push({ hash, row });
    }
    const removes = Object.keys(had)
      .filter((k) => !seen.has(k))
      .sort()
      .map((k) => keyObject(table, k));
    tables.push({ table, upserts, removes, unchanged });
  }
  // A round is finished again when it, a hole or a shot changed since it was
  // last finished; only rounds the generator still has can be finished.
  const finished = ledger[FINISHED_ROUNDS] ?? {};
  const roundsToFinish: DemoRoundToFinish[] = [];
  for (const round of dataset.tables.golf_rounds) {
    const id = String(round.id);
    const p = partsOf(id);
    const hash = rowHash([p.round, ...[...p.children].sort()]);
    if (opts.full || finished[id] !== hash) roundsToFinish.push({ id, hash });
  }
  roundsToFinish.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { teamId: dataset.teamId, version: dataset.version, tables, roundsToFinish };
}

/** Groups rows by their column set: one apply call takes rows with the same columns. */
function byColumns(items: DemoWriteItem[]): DemoWriteItem[][] {
  const groups = new Map<string, DemoWriteItem[]>();
  for (const item of items) {
    const sig = Object.keys(item.row).filter((k) => item.row[k] !== undefined).sort().join(',');
    const g = groups.get(sig) ?? [];
    g.push(item);
    groups.set(sig, g);
  }
  return [...groups.values()];
}

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** Drops undefined fields: the database sees exactly the columns the generator set. */
function clean(row: DemoRow): DemoRow {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) as DemoRow;
}

/**
 * Sends a plan: removals first (children before parents), then upserts
 * (parents before children), then the round recomputes. Stops at the first
 * failed call; the next run picks up from the ledger.
 */
export async function applyDemoWrite(port: DemoWritePort, plan: DemoWritePlan, log: (line: string) => void = () => {}): Promise<DemoWriteResult> {
  assertDemoTeam(plan.teamId);
  const result = new Map<DemoTable, { table: DemoTable; upserted: number; skipped: string[]; removed: number; unchanged: number }>(
    plan.tables.map((t) => [t.table, { table: t.table, upserted: 0, skipped: [], removed: 0, unchanged: t.unchanged }]),
  );

  for (const t of [...plan.tables].reverse()) {
    for (const keys of chunks(t.removes, REMOVE_BATCH)) {
      const removed = await port.remove(plan.teamId, t.table, keys);
      result.get(t.table)!.removed += removed;
    }
    const removed = result.get(t.table)!.removed;
    if (t.removes.length) log(`removed ${removed} ${t.table}${removed < t.removes.length ? ` (${t.removes.length - removed} were kept by the database and stay in the ledger)` : ''}`);
  }

  for (const t of plan.tables) {
    for (const group of byColumns(t.upserts)) {
      for (const batch of chunks(group, APPLY_BATCH)) {
        const items = batch.map((i) => ({ hash: i.hash, row: clean(i.row) }));
        const { written, skipped } = await port.apply(plan.teamId, t.table, items, plan.version);
        const r = result.get(t.table)!;
        r.upserted += written;
        r.skipped.push(...skipped);
      }
    }
    const r = result.get(t.table)!;
    if (t.upserts.length) log(`wrote ${r.upserted} ${t.table}${r.skipped.length ? `, skipped ${r.skipped.length} that were not the generator's` : ''}`);
  }

  let roundsFinished = 0;
  for (const rounds of chunks(plan.roundsToFinish, FINISH_BATCH)) roundsFinished += await port.finishRounds(plan.teamId, rounds, plan.version);
  if (plan.roundsToFinish.length) log(`recomputed totals, stats and strokes gained for ${roundsFinished} rounds`);

  return { tables: [...result.values()], roundsFinished };
}

// ------------------------------------------------------------------ the Supabase port

interface RpcError {
  message: string;
  code?: string;
}
/** The one client method the writer needs. The four functions are not in the generated types until the migration is applied. */
export interface DemoRpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError | null }>;
}

function isMissingFunction(error: RpcError): boolean {
  return error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist/i.test(error.message);
}

async function call<T>(client: DemoRpcClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    if (isMissingFunction(error)) throw new DemoPlumbingMissingError(`${fn}: ${error.message}`);
    throw new Error(`${fn} failed: ${error.message}${error.code ? ` (${error.code})` : ''}`);
  }
  return data as T;
}

export function supabaseDemoPort(client: DemoRpcClient): DemoWritePort {
  return {
    async begin(teamId, opts) {
      const data = await call<{ pruned: number; tables: DemoLedger }>(client, 'golf_demo_begin', { p_team: teamId, p_prune: opts?.prune ?? true });
      return { pruned: data?.pruned ?? 0, ledger: data?.tables ?? {} };
    },
    async apply(teamId, table, items, version) {
      const data = await call<{ written: number; skipped: string[] }>(client, 'golf_demo_apply', {
        p_team: teamId,
        p_table: table,
        p_items: items,
        p_version: version,
      });
      return { written: data?.written ?? 0, skipped: data?.skipped ?? [] };
    },
    async remove(teamId, table, keys) {
      return (await call<number>(client, 'golf_demo_remove', { p_team: teamId, p_table: table, p_keys: keys })) ?? 0;
    },
    async finishRounds(teamId, rounds, version) {
      return (await call<number>(client, 'golf_demo_finish_rounds', { p_team: teamId, p_rounds: rounds, p_version: version })) ?? 0;
    },
  };
}

/** One line per table for the log and the PR: what a plan would send. */
export function describePlan(plan: DemoWritePlan): string {
  const lines = ['| Table | Write | Remove | Unchanged |', '|---|---|---|---|'];
  for (const t of plan.tables) {
    if (!t.upserts.length && !t.removes.length && !t.unchanged) continue;
    lines.push(`| ${t.table} | ${t.upserts.length} | ${t.removes.length} | ${t.unchanged} |`);
  }
  lines.push('', `Rounds to recompute: ${plan.roundsToFinish.length}.`);
  return lines.join('\n');
}
