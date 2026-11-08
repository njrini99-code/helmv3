import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { logServerError } from '@/lib/server-error-logger';
import type { CoachChatContext } from './context';
import { unavailableEnvelope, nowIso, type ToolEnvelope } from './provenance';
import { columnWithUnit, ROUND_LINES_COLUMNS, type RoundLinesColumn } from './data-dictionary';
import { defaultOrder, refused, rowsEnvelope, type LooseBuilder, type Row, type Value } from './team-query-shared';
import type { TeamQueryInput } from './team-query';

/**
 * `round_lines`: one row per round, with the player, the day, the course, the round type, the score, the putts and three-putts, greens and
 * fairways, and the strokes gained parts, so a question about rounds is one read and not a round list joined to a stat-line list by hand.
 *
 * It is two reads through the caller's own session, merged here (RLS applies to both; nothing is read with the service client):
 *   - `golf_rounds` for the roster's rounds (test rounds out), filtered, ordered by date and capped;
 *   - `golf_round_stats_cache` for the same round ids, for what the round row does not hold (three putts) and to fill a figure the round row
 *     leaves empty (the stat line sums the holes where the round was entered by hole).
 * A round with no stat line (unfinished, or posted as a total only) keeps its own figures and has empty three-putts: empty, never zero.
 * No migration: the two tables are already related by `golf_round_stats_cache.round_id`, and both are readable through their own policies.
 */

export const ROUND_LINES = 'round_lines' as const;
const MAX_FILTERS = 8;

type Sb = SupabaseClient<Database>;

/** The columns of a round line that are the round row's own, and so can be filtered and ordered on. `three_putts` is the stat line's. */
const NATIVE = ROUND_LINES_COLUMNS.filter((c) => c !== 'three_putts');
const NATIVE_SET: ReadonlySet<string> = new Set(NATIVE);
/** A figure the round row may leave empty and the stat line holds under its own name. */
const CACHE_FALLBACK: Partial<Record<RoundLinesColumn, string>> = {
  total_putts: 'total_putts',
  total_gir: 'greens_hit',
  total_gir_possible: 'greens_total',
  total_fairways_hit: 'fairways_hit',
  total_fairways: 'fairways_total',
  total_penalties: 'penalty_strokes',
  front_nine: 'front_nine',
  back_nine: 'back_nine',
};
const CACHE_SELECT = ['round_id', 'three_putts', ...new Set(Object.values(CACHE_FALLBACK))].join(', ');

/** The tool description's line for this source. */
export function describeRoundLines(): string {
  return `round_lines (rounds, one row per round with its stat line joined; roster players; the default order is round_date, newest first; filter and order on the round's own columns, not three_putts): ${ROUND_LINES_COLUMNS.map((c) => columnWithUnit(ROUND_LINES, c)).join(', ')}. Prefer round_lines for any question about rounds.`;
}

export async function queryRoundLines(sb: Sb, ctx: CoachChatContext, input: TeamQueryInput): Promise<ToolEnvelope> {
  const columns = [...new Set(input.columns)];
  const bad = columns.find((c) => !(ROUND_LINES_COLUMNS as readonly string[]).includes(c));
  if (bad) return refused(`"${bad}" is not a column you can read on round_lines.`, ROUND_LINES_COLUMNS);
  if (input.filters.length > MAX_FILTERS) return refused(`At most ${MAX_FILTERS} filters.`);

  const rosterIds = ctx.roster.map((p) => p.id);
  let playerIds = rosterIds;
  const filters: Array<{ column: string; op: TeamQueryInput['filters'][number]['op']; value: Value | Array<string | number> }> = [];
  for (const f of input.filters) {
    if (f.column === 'team_id') return refused('The team is fixed: leave team_id out.');
    if (f.column === 'player_id') {
      if (f.op !== 'eq' && f.op !== 'in') return refused('player_id can only be filtered with eq or in.');
      const asked = (Array.isArray(f.value) ? f.value : [f.value]).filter((v): v is string => typeof v === 'string');
      playerIds = playerIds.filter((id) => asked.includes(id));
      continue;
    }
    if (!NATIVE_SET.has(f.column)) return refused(`"${f.column}" is not a column you can filter on in round_lines (three_putts comes from the stat line and cannot be filtered).`, NATIVE);
    if (f.op === 'in' && (!Array.isArray(f.value) || f.value.length === 0)) return refused('"in" needs a non-empty list.');
    if (f.op === 'is' && f.value !== null && typeof f.value !== 'boolean') return refused('"is" takes null, true or false.');
    if ((f.op === 'eq' || f.op === 'gte' || f.op === 'lte') && typeof f.value !== 'string' && typeof f.value !== 'number') return refused(`"${f.op}" takes one string or number.`);
    filters.push({ column: f.column, op: f.op, value: f.value });
  }

  const dateRule = { order: { column: 'round_date', ascending: false } };
  const order = input.order ?? defaultOrder(dateRule, columns, filters, NATIVE_SET);
  if (!NATIVE_SET.has(order.column)) return refused(`"${order.column}" cannot be ordered by in round_lines (three_putts comes from the stat line).`, NATIVE);
  const limit = Math.min(Math.max(input.limit, 1), 200);

  const who = new Map(ctx.roster.map((p) => [p.id, p.name]));
  const empty = (): ToolEnvelope => ({ summary: 'No rounds found.', measurements: [], series: [], detail: { kind: 'team_data', rows: [], row_count: 0, limit, total_rows: 0, truncated: false }, coverage: 'empty', coverage_note: null, as_of: nowIso() });
  if (playerIds.length === 0 || rosterIds.length === 0) return empty();

  // What the round row has to give: the columns asked for that it holds, the order and the day (the tie-break), and the ids that join.
  const own = [...new Set([...columns.filter((c) => NATIVE_SET.has(c)), order.column, 'round_date', ...columns.flatMap((c) => (CACHE_FALLBACK[c as RoundLinesColumn] ? [c] : []))])];
  const selectList = ['id', 'player_id', ...own].join(', ');
  const base = () => {
    let q = (sb as unknown as { from: (t: string) => LooseBuilder }).from('golf_rounds').select(selectList, { count: 'exact' }).eq('is_test', false);
    for (const f of filters) q = f.op === 'eq' ? q.eq(f.column, f.value) : f.op === 'in' ? q.in(f.column, f.value as unknown[]) : f.op === 'gte' ? q.gte(f.column, f.value) : f.op === 'lte' ? q.lte(f.column, f.value) : q.is(f.column, f.value as null | boolean);
    q = q.order(order.column, { ascending: order.ascending });
    // Rounds on the same day, or equal in the asked column, keep a stable order: the day, then the id.
    if (order.column !== 'round_date') q = q.order('round_date', { ascending: false });
    return q.order('id', { ascending: true }).limit(limit);
  };

  const slices = chunkIds(playerIds).map((chunk) => base().in('player_id', chunk));
  const rounds: Row[] = [];
  let total: number | null = 0;
  for (const q of slices) {
    const { data, error, count } = await q;
    if (error) return failed(ctx, 'rounds', error.message);
    rounds.push(...(data ?? []));
    total = total !== null && typeof count === 'number' ? total + count : null;
  }
  if (slices.length > 1) {
    const dir = order.ascending ? 1 : -1;
    rounds.sort((a, b) => {
      const x = a[order.column];
      const y = b[order.column];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }
  const page = rounds.slice(0, limit);
  if (page.length === 0) return empty();

  // The stat lines of exactly these rounds, in id slices (an `.in()` past ~200 ids fails before Postgres sees it).
  const needsLine = columns.some((c) => c === 'three_putts' || CACHE_FALLBACK[c as RoundLinesColumn]);
  const lines = new Map<string, Row>();
  if (needsLine) {
    for (const chunk of chunkIds(page.map((r) => String(r.id)))) {
      const { data, error } = await (sb as unknown as { from: (t: string) => LooseBuilder }).from('golf_round_stats_cache').select(CACHE_SELECT).in('round_id', chunk).limit(1000);
      if (error) return failed(ctx, 'stat lines', error.message);
      for (const row of data ?? []) lines.set(String(row.round_id), row);
    }
  }

  const rows = page.map((r) => {
    const line = lines.get(String(r.id));
    const out: Row = {};
    for (const col of columns) {
      if (col === 'three_putts') out[col] = line ? (line.three_putts ?? null) : null;
      else {
        const fallback = CACHE_FALLBACK[col as RoundLinesColumn];
        out[col] = r[col] ?? (fallback && line ? (line[fallback] ?? null) : null);
      }
    }
    return { player: who.get(String(r.player_id)) ?? 'A player', player_id: r.player_id, ...out };
  });
  return rowsEnvelope({ label: 'rounds', table: ROUND_LINES, columns: [...columns, 'player_id'], rows, total, limit, order });
}

function failed(ctx: CoachChatContext, what: string, message: string | undefined): ToolEnvelope {
  void logServerError(`queryRoundLines failed (${what}): ${message ?? 'unknown'}`, { action: 'coachhelm.ask.queryRoundLines', feature: 'coachhelm_chat', userId: ctx.coach_id, handled: true });
  return unavailableEnvelope(`Could not read the ${what}.`, 'That read failed. This is not the same as no rounds.');
}
