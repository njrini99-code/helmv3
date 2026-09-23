/**
 * A9 slice 3 (repair-plan addendum §14.12): the coach-facing READ side of
 * `golf_insight_outcome_attribution` — the table `causality/attribute.ts`
 * (round-level) and `causality/comparable-attribute.ts` (shot-level, A9
 * slices 1-2) write to. Nothing before this slice ever read this table back
 * for display (confirmed during the observed-outcome-language audit,
 * repair-plan §14.12 item (a) — `InsightCard.tsx`'s `OutcomeBadge` reads a
 * completely different, human-self-report column, `golf_coach_insights.
 * outcome_status`).
 *
 * Gated behind `coachhelm_comparable_opportunity_attribution` (default off
 * everywhere) at the SERVER-ACTION layer
 * (`src/app/golf/actions/insight-attribution.ts`), not here — this module
 * is a pure DB-facing loader with no flag awareness, same separation
 * `comparable-attribute.ts` (compute) keeps from its own cron wiring.
 *
 * PLAYER-SCOPED, ERRORS BOUND: `readAttributionForPlayer` first resolves the
 * player's own insight ids (RLS-scoped to the caller's coach via the
 * existing `golf_coach_insights` policies), then reads attribution rows for
 * those ids ONLY — chunked at `chunkIds`'s 200-id URL cap
 * (`src/lib/supabase/chunk-ids.ts`) and paginated per chunk via
 * `fetchAllRowsResult` (the 1000-row PostgREST cap, `src/lib/supabase/
 * fetch-all-rows.ts`) — see `.claude/rules/database.md`'s "two silent-wrong-
 * answer traps". A genuine read failure on ANY step (the insight-id lookup,
 * or any attribution chunk) returns `{ ok: false }` for the WHOLE call —
 * never a partial success that silently drops the failed chunk's rows.
 *
 * NEVER EMPTY ON FAILURE: `{ ok: false }` is the only failure shape; a
 * legitimate "no attribution yet" (the insight/player has zero rows) is
 * `{ ok: true, rows: [] }`. Collapsing these would let the coach UI render
 * "not enough data yet" for what might actually be an outage — the caller
 * (the server action, then the view model) must be able to tell "we don't
 * know" from "we checked; there's nothing there".
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { fromUntyped } from '@/lib/supabase/untyped';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';

type Sb = SupabaseClient<Database>;

export interface AttributionRow {
  insight_id: string;
  target_metric_id: string;
  baseline_value: number;
  post_value: number;
  delta: number;
  n_rounds_before: number;
  n_rounds_after: number;
  /**
   * Raw `method_version` column value. `null` covers THREE distinct cases
   * the view model (`attribution-view-model.ts`) collapses into one honest
   * "earlier method" bucket, per the migration's own documented semantics
   * (`supabase/migrations/20260922230000_v3_attribution_method_version.sql`):
   * a genuine NULL on an existing row (documented as "v1"), a row written
   * by the round-level `v2_observed_delta` path before this reader existed
   * (mapped to `null` below — see the "LEGACY MAPS TO null" note), and the
   * column not existing in the physical table yet (migration unapplied —
   * `isUnknownColumnError` degrade path). None of these three cases can be
   * told apart from a read alone, and none should be — a reader must never
   * claim more certainty about "which old method" than the data supports.
   */
  method_version: string | null;
}

export type AttributionReadResult = { ok: true; rows: AttributionRow[] } | { ok: false };

const ATTRIBUTION_COLUMNS =
  'insight_id, target_metric_id, baseline_value, post_value, delta, n_rounds_before, n_rounds_after, method_version';
const ATTRIBUTION_COLUMNS_NO_METHOD_VERSION =
  'insight_id, target_metric_id, baseline_value, post_value, delta, n_rounds_before, n_rounds_after';

/**
 * Same detection as `causality/comparable-attribute.ts` and `api/cron/v3/
 * causality-attribute/route.ts` — an (unexported) copy in each file rather
 * than a shared import, matching those two files' own established
 * convention (see either's doc comment for the PGRST204/42703 rationale).
 * All three call sites guard the SAME still-unapplied migration
 * (20260922230000).
 */
function isUnknownColumnError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST204' || error.code === '42703') return true;
  const message = (error.message ?? '').toLowerCase();
  return message.includes('could not find') && message.includes('column');
}

interface RawAttributionRow {
  insight_id: string;
  target_metric_id: string;
  baseline_value: number;
  post_value: number;
  delta: number;
  n_rounds_before: number;
  n_rounds_after: number;
  method_version?: string | null;
}

/**
 * `applyFilter` narrows the untyped query builder (`.eq()`/`.in()`) before
 * this function appends the shared `.order().range()` pagination tail.
 * Typed as `ReturnType<typeof fromUntyped>` (i.e. `any`, `fromUntyped`'s own
 * declared return type) rather than a hand-written builder shape — the
 * chain is genuinely untyped end to end (this table's `method_version`
 * column isn't in the generated `Database` types yet), so a hand-rolled
 * intermediate type would just be a second, driftable place to keep in
 * sync with `fromUntyped`'s real (`any`) surface.
 */
async function fetchAttributionRows(
  sb: Sb,
  applyFilter: (query: ReturnType<typeof fromUntyped>) => ReturnType<typeof fromUntyped>,
): Promise<AttributionReadResult> {
  const primary = await fetchAllRowsResult<RawAttributionRow>((from, to) =>
    applyFilter(fromUntyped(sb, 'golf_insight_outcome_attribution').select(ATTRIBUTION_COLUMNS))
      .order('insight_id', { ascending: true })
      .range(from, to),
  );

  if (primary.error && isUnknownColumnError(primary.error)) {
    // Migration 20260922230000 not applied yet — degrade to the pre-N10
    // column shape, same as the write side's own degrade
    // (`comparable-attribute.ts`'s `writeComparableAttribution`, `api/cron/
    // v3/causality-attribute/route.ts`). Every row read this way predates
    // `method_version` existing at all, so `method_version: null` here is
    // exactly as honest as the migration's own "NULL = v1" convention.
    const degraded = await fetchAllRowsResult<Omit<RawAttributionRow, 'method_version'>>((from, to) =>
      applyFilter(fromUntyped(sb, 'golf_insight_outcome_attribution').select(ATTRIBUTION_COLUMNS_NO_METHOD_VERSION))
        .order('insight_id', { ascending: true })
        .range(from, to),
    );
    if (degraded.error) return { ok: false };
    return { ok: true, rows: (degraded.data ?? []).map((r) => ({ ...r, method_version: null })) };
  }

  if (primary.error) return { ok: false };
  return {
    ok: true,
    rows: (primary.data ?? []).map((r) => ({ ...r, method_version: r.method_version ?? null })),
  };
}

/** Single-insight read — at most one row (the table's FK to
 *  `golf_coach_insights` is one-to-one), returned as a 0- or 1-element
 *  array so the caller has one shape to handle regardless of which loader
 *  it called. */
export async function readAttributionForInsight(sb: Sb, insightId: string): Promise<AttributionReadResult> {
  if (!insightId) return { ok: true, rows: [] };
  return fetchAttributionRows(sb, (q) => q.eq('insight_id', insightId));
}

/**
 * Player-scoped read: every attribution row for every insight belonging to
 * `playerId` that the CALLER'S OWN Supabase client can see (RLS —
 * `attribution_coach_read` — already restricts this to the coach who owns
 * the insight; this function adds no separate authorization, matching
 * `causality/comparable-attribute.ts`'s own "no I/O beyond what's asked"
 * scope — the server action layer is where access is verified, same split
 * as `insight-delivery.ts`'s `verifyPlayerAccess` call sites).
 */
export async function readAttributionForPlayer(sb: Sb, playerId: string): Promise<AttributionReadResult> {
  if (!playerId) return { ok: true, rows: [] };

  const insightIdsResult = await fetchAllRowsResult<{ id: string }>((from, to) =>
    sb
      .from('golf_coach_insights')
      .select('id')
      .eq('player_id', playerId)
      .order('id', { ascending: true })
      .range(from, to),
  );
  if (insightIdsResult.error) return { ok: false };

  const insightIds = (insightIdsResult.data ?? []).map((r) => r.id);
  if (insightIds.length === 0) return { ok: true, rows: [] };

  const rows: AttributionRow[] = [];
  for (const idChunk of chunkIds(insightIds)) {
    const chunkResult = await fetchAttributionRows(sb, (q) => q.in('insight_id', idChunk));
    if (!chunkResult.ok) return { ok: false };
    rows.push(...chunkResult.rows);
  }
  return { ok: true, rows };
}
