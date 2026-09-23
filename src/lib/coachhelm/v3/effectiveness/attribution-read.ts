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
import { COMPARABLE_OPPORTUNITIES_METHOD_VERSION } from '@/lib/coachhelm/v3/evaluation/comparable-opportunities';
import {
  COMPARABLE_OPPORTUNITIES_LIMITED_METHOD_VERSION,
  INTERVENTION_ACTION_TYPES,
} from '@/lib/coachhelm/v3/causality/comparable-attribute';

type Sb = SupabaseClient<Database>;

export type AttributionAnchorKind = 'action' | 'exposure';

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
  /**
   * Package 10 (owner decision, anchor-on-first-action): which real record
   * `surfaced_at` came from, RE-DERIVED here rather than read off a stored
   * column — `golf_insight_outcome_attribution` has no column for it (no
   * migration this slice; see `comparable-attribute.ts`'s
   * `ComparableAttributionRow.anchor_kind` doc comment).
   *
   * Derivation: an EXACT string match of this row's `surfaced_at` against a
   * qualifying `golf_insight_action.created_at` for the same insight —
   * never "does any action exist for this insight", which would
   * mis-classify an exposure-anchored row as soon as ANY later action
   * appeared (see `attachAnchorKind`'s doc comment for why that matters).
   *
   * `null` for a ROUND-LEVEL row (`attribute.ts`'s `v2_observed_delta` or a
   * legacy/unknown `method_version`) — those write `surfaced_at` from
   * `golf_coach_insights.created_at`, an admitted proxy, never a real
   * exposure or action instant, so labeling one `'exposure'` would be a
   * false claim ("since first shown") about data that was never actually
   * checked against an exposure row at all. Only a comparable
   * (shot-level) `method_version` gets a non-null `anchor_kind`.
   */
  anchor_kind: AttributionAnchorKind | null;
}

export type AttributionReadResult = { ok: true; rows: AttributionRow[] } | { ok: false };

const ATTRIBUTION_COLUMNS =
  'insight_id, target_metric_id, baseline_value, post_value, delta, n_rounds_before, n_rounds_after, method_version, surfaced_at';
const ATTRIBUTION_COLUMNS_NO_METHOD_VERSION =
  'insight_id, target_metric_id, baseline_value, post_value, delta, n_rounds_before, n_rounds_after, surfaced_at';
const COMPARABLE_METHOD_VERSIONS: ReadonlySet<string> = new Set([
  COMPARABLE_OPPORTUNITIES_METHOD_VERSION,
  COMPARABLE_OPPORTUNITIES_LIMITED_METHOD_VERSION,
]);

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
  surfaced_at: string;
}

/**
 * Bulk-derives `anchor_kind` for every row whose `method_version` is a
 * comparable (shot-level) version — round-level/earlier/unknown rows get
 * `null` without a DB call at all (see `AttributionRow.anchor_kind`'s doc
 * comment for why they must never get a label).
 *
 * EXACT-MATCH derivation, not "does any action exist for this insight":
 * `golf_insight_outcome_attribution` rows are permanent and idempotent
 * (PK on `insight_id`, written once), but `golf_insight_action` is
 * append-only and keeps growing — a coach can act on an insight AFTER its
 * attribution row was already written and anchored on the exposure. "any
 * action exists" would then wrongly re-derive that old exposure-anchored
 * row as `'action'`-anchored the moment that later action landed, silently
 * relabeling a historical value (exactly what Package 10 item (b) forbids).
 * Matching the row's own `surfaced_at` string against a qualifying action's
 * `created_at` is stable regardless of what actions appear later: the
 * action that was actually used as the anchor (if any) keeps that exact
 * timestamp forever; a later, different action has a different timestamp
 * and never matches.
 */
async function attachAnchorKind(sb: Sb, rows: RawAttributionRow[]): Promise<AttributionReadResult> {
  const comparableInsightIds = Array.from(
    new Set(
      rows
        .filter((r) => COMPARABLE_METHOD_VERSIONS.has(r.method_version ?? ''))
        .map((r) => r.insight_id),
    ),
  );

  // Map<insight_id, Set<created_at>> — a qualifying action's exact timestamp
  // strings for that insight, for the exact-match check below.
  const actionTimestampsByInsightId = new Map<string, Set<string>>();
  for (const idChunk of chunkIds(comparableInsightIds)) {
    const actionResult = await fetchAllRowsResult<{ insight_id: string; created_at: string }>((from, to) =>
      sb
        .from('golf_insight_action')
        .select('insight_id, created_at')
        .in('insight_id', idChunk)
        .in('action_type', INTERVENTION_ACTION_TYPES)
        .order('insight_id', { ascending: true })
        .range(from, to),
    );
    // A failed action read must not silently read as "no action" (which
    // would derive every affected row as `'exposure'` — a false claim of
    // certainty this function does not have). Same "NEVER EMPTY ON
    // FAILURE"/"never partial success" discipline this file's header
    // establishes for the primary read: the whole call fails, not just this
    // row's label.
    if (actionResult.error) return { ok: false };
    for (const row of actionResult.data ?? []) {
      const set = actionTimestampsByInsightId.get(row.insight_id);
      if (set) set.add(row.created_at);
      else actionTimestampsByInsightId.set(row.insight_id, new Set([row.created_at]));
    }
  }

  return {
    ok: true,
    rows: rows.map((r) => {
      const methodVersion = r.method_version ?? null;
      if (!COMPARABLE_METHOD_VERSIONS.has(methodVersion ?? '')) {
        return { ...r, method_version: methodVersion, anchor_kind: null };
      }
      const matchesAction = actionTimestampsByInsightId.get(r.insight_id)?.has(r.surfaced_at) ?? false;
      return { ...r, method_version: methodVersion, anchor_kind: matchesAction ? 'action' : 'exposure' };
    }),
  };
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
    // No method_version column means every row is round-level/earlier —
    // COMPARABLE_METHOD_VERSIONS.has(null) is always false, so
    // attachAnchorKind is a no-op here (anchor_kind: null throughout) and
    // makes no extra DB call. Called anyway rather than inlined, so there is
    // exactly one place that decides anchor_kind.
    const attached = await attachAnchorKind(
      sb,
      (degraded.data ?? []).map((r) => ({ ...r, method_version: null })),
    );
    return attached;
  }

  if (primary.error) return { ok: false };
  const attached = await attachAnchorKind(
    sb,
    (primary.data ?? []).map((r) => ({ ...r, method_version: r.method_version ?? null })),
  );
  return attached;
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
