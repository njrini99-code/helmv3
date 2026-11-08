import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { logServerError } from '@/lib/server-error-logger';
import type { CoachChatContext } from './context';
import { nowIso, unavailableEnvelope, type ToolEnvelope } from './provenance';
import { looseRule, TEAM_QUERY_TABLE_NAMES, type LooseRule } from './team-query-allowlist';

/**
 * `query_team_data`: the long tail. One generic, read-only reader over the static allowlist in `team-query-allowlist.ts`.
 *
 * What makes it safe to hand to a model:
 *   - the table, every column, filter and the order are checked against the allowlist before a query is built;
 *   - the scope is added by this code, never taken from the model: `team_id` is the session's team, `player_id` is the active roster
 *     (a `player_id` filter can only narrow it, and an id off the roster is dropped);
 *   - filters are eq / in / gte / lte / is, at most eight, and `limit` is at most 200;
 *   - it reads with the caller's own session (`sb`, row-level security still applies), never the service client;
 *   - rows come back in `detail.rows`, each labelled with the player where the table has one, so the numeric audit can ground them.
 */

export const QUERY_ROW_LIMIT = 200;
export const QUERY_FILTER_OPS = ['eq', 'in', 'gte', 'lte', 'is'] as const;
const MAX_FILTERS = 8;
const MAX_COLUMNS = 20;

const Scalar = z.union([z.string().max(100), z.number(), z.boolean(), z.null()]);
export const TeamQueryInput = z.object({
  table: z.enum(TEAM_QUERY_TABLE_NAMES),
  columns: z.array(z.string().min(1).max(60)).min(1).max(MAX_COLUMNS),
  filters: z.array(z.object({ column: z.string().min(1).max(60), op: z.enum(QUERY_FILTER_OPS), value: z.union([Scalar, z.array(z.union([z.string().max(100), z.number()])).max(50)]) })).max(MAX_FILTERS).default([]),
  order: z.object({ column: z.string().min(1).max(60), ascending: z.boolean().default(false) }).optional(),
  limit: z.number().int().min(1).max(QUERY_ROW_LIMIT).default(50),
});
export type TeamQueryInput = z.infer<typeof TeamQueryInput>;

type Sb = SupabaseClient<Database>;
type Value = string | number | boolean | null;
type Row = Record<string, unknown>;
/** The reader builds the query from validated strings, so the typed client is stepped around here and nowhere else. */
type LooseBuilder = {
  select: (cols: string) => LooseBuilder;
  eq: (c: string, v: unknown) => LooseBuilder;
  in: (c: string, v: unknown[]) => LooseBuilder;
  gte: (c: string, v: unknown) => LooseBuilder;
  lte: (c: string, v: unknown) => LooseBuilder;
  is: (c: string, v: null | boolean) => LooseBuilder;
  order: (c: string, o: { ascending: boolean }) => LooseBuilder;
  limit: (n: number) => LooseBuilder;
} & PromiseLike<{ data: Row[] | null; error: { message?: string } | null }>;

const refused = (why: string, allowed?: readonly string[]): ToolEnvelope => ({
  summary: 'That query was not run.',
  measurements: [],
  series: [],
  detail: { refused: true, reason: why, ...(allowed ? { allowed_columns: allowed } : {}) },
  coverage: 'unavailable',
  coverage_note: why,
  as_of: nowIso(),
});

const isScalar = (v: unknown): v is string | number => typeof v === 'string' || typeof v === 'number';

/** Describes the allowlist for the tool's description: each table, what it holds and its columns. Tournament tables only while their flag is on. */
export function describeQueryTables(opts: { tournamentsOn: boolean }): string {
  return TEAM_QUERY_TABLE_NAMES.filter((t) => opts.tournamentsOn || !looseRule(t)?.flag)
    .map((t) => {
      const r = looseRule(t) as LooseRule;
      return `${t} (${r.label}; ${r.scope === 'player' ? 'roster players' : 'this team'}): ${r.columns.join(', ')}`;
    })
    .join('\n');
}

export async function queryTeamData(sb: Sb, ctx: CoachChatContext, input: TeamQueryInput, opts: { tournamentsOn: boolean }): Promise<ToolEnvelope> {
  const rule = looseRule(input.table);
  if (!rule || (rule.flag && !opts.tournamentsOn)) return refused('That table is not available.');
  const allowed = new Set(rule.columns);

  const columns = [...new Set(input.columns)];
  const badColumn = columns.find((c) => !allowed.has(c));
  if (badColumn) return refused(`"${badColumn}" is not a column you can read on this table.`, rule.columns);
  if (input.filters.length > MAX_FILTERS) return refused(`At most ${MAX_FILTERS} filters.`);

  // Filters: validated against the allowlist and the operator's shape. The scope column is the reader's, not the model's.
  const rosterIds = ctx.roster.map((p) => p.id);
  let playerIds = rosterIds;
  const filters: Array<{ column: string; op: (typeof QUERY_FILTER_OPS)[number]; value: Value | Array<string | number> }> = [];
  for (const f of input.filters) {
    if (f.column === 'team_id') return refused('The team is fixed: leave team_id out.');
    if (f.column === 'player_id' && rule.scope === 'player') {
      if (f.op !== 'eq' && f.op !== 'in') return refused('player_id can only be filtered with eq or in.');
      const asked = (Array.isArray(f.value) ? f.value : [f.value]).filter((v): v is string => typeof v === 'string');
      playerIds = playerIds.filter((id) => asked.includes(id));
      continue;
    }
    if (!allowed.has(f.column)) return refused(`"${f.column}" is not a column you can filter on in this table.`, rule.columns);
    if (f.op === 'in') {
      if (!Array.isArray(f.value) || f.value.length === 0) return refused('"in" needs a non-empty list.');
    } else if (f.op === 'is') {
      if (f.value !== null && typeof f.value !== 'boolean') return refused('"is" takes null, true or false.');
    } else if (!isScalar(f.value)) {
      return refused(`"${f.op}" takes one string or number.`);
    }
    filters.push({ column: f.column, op: f.op, value: f.value });
  }

  const order = input.order ?? { column: rule.order.column, ascending: rule.order.ascending };
  if (input.order && !allowed.has(order.column)) return refused(`"${order.column}" is not a column you can order by in this table.`, rule.columns);
  const limit = Math.min(Math.max(input.limit, 1), QUERY_ROW_LIMIT);

  const who = new Map(ctx.roster.map((p) => [p.id, p.name]));
  const empty = (): ToolEnvelope => ({ summary: `No ${rule.label} found.`, measurements: [], series: [], detail: { rows: [], row_count: 0, limit }, coverage: 'empty', coverage_note: null, as_of: nowIso() });
  if (rule.scope === 'player' && (playerIds.length === 0 || rosterIds.length === 0)) return empty();

  const selectList = [...columns, ...(rule.scope === 'player' ? ['player_id'] : [])].join(', ');
  const base = () => {
    let q = (sb as unknown as { from: (t: string) => LooseBuilder }).from(input.table).select(selectList);
    for (const [col, val] of Object.entries(rule.forced ?? {})) q = q.eq(col, val);
    for (const f of filters) {
      q = f.op === 'eq' ? q.eq(f.column, f.value) : f.op === 'in' ? q.in(f.column, f.value as unknown[]) : f.op === 'gte' ? q.gte(f.column, f.value) : f.op === 'lte' ? q.lte(f.column, f.value) : q.is(f.column, f.value as null | boolean);
    }
    return q.order(order.column, { ascending: order.ascending }).limit(limit);
  };

  // A player-scoped table runs once per slice of the roster (an `.in()` past ~200 ids fails before Postgres sees it), then merges.
  const slices = rule.scope === 'player' ? chunkIds(playerIds).map((chunk) => base().in('player_id', chunk)) : [base().eq('team_id', ctx.team_id)];
  const rows: Row[] = [];
  for (const q of slices) {
    const { data, error } = await q;
    if (error) {
      void logServerError(`queryTeamData failed (${input.table}): ${error.message ?? 'unknown'}`, { action: 'coachhelm.ask.queryTeamData', feature: 'coachhelm_chat', userId: ctx.coach_id, handled: true });
      return unavailableEnvelope(`Could not read ${rule.label}.`, 'That read failed. This is not the same as no rows.');
    }
    rows.push(...(data ?? []));
  }
  if (slices.length > 1) {
    const dir = order.ascending ? 1 : -1;
    rows.sort((a, b) => {
      const x = a[order.column];
      const y = b[order.column];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }
  // Only what was asked for leaves this function, whatever the server sent back.
  const keep = new Set([...columns, ...(rule.scope === 'player' ? ['player_id'] : [])]);
  const shown = rows.slice(0, limit).map((r) => {
    const row: Row = Object.fromEntries(Object.entries(r).filter(([k]) => keep.has(k)));
    return typeof row.player_id === 'string' ? { ...row, player: who.get(row.player_id) ?? 'A player' } : row;
  });
  if (shown.length === 0) return empty();
  const full = rows.length >= limit;
  return {
    summary: `${shown.length} row${shown.length === 1 ? '' : 's'} of ${rule.label}.`,
    measurements: [],
    series: [],
    detail: { kind: 'team_data', rows: shown, row_count: shown.length, limit, ordered_by: order.column, newest_first: !order.ascending },
    coverage: full ? 'partial' : 'complete',
    coverage_note: full ? `Showing the first ${limit} rows in this order; there may be more. Narrow the filters for the rest.` : null,
    as_of: nowIso(),
  };
}
