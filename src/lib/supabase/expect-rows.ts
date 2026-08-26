// =============================================================================
// src/lib/supabase/expect-rows.ts
//
// expectRows — flags a SILENT RLS denial: a query that returned NO error and
// NO rows, on a read whose own auth context should have guaranteed at least
// one.
//
// WHY THIS IS A DIFFERENT SIGNAL THAN maybeCaptureRlsDenial
// (src/lib/admin/rls-denial.ts). That module classifies an EXPLICIT Postgres
// rejection — code 42501, or "row-level security" in the error text. RLS does
// not always fail that loudly: a SELECT a policy blocks is filtered out of
// the result set, not rejected, so Postgres returns 200 OK with zero rows and
// no `error` at all. A missing grant, a policy with a wrong `USING` clause,
// or a stale/renamed cookie context can all produce exactly that shape —
// `{ data: [], error: null }` (or `{ data: null, error: null }` for a
// `.single()`/`.maybeSingle()` query) — indistinguishable from "the row
// genuinely doesn't exist yet" unless the CALLER can vouch that its own
// context guarantees a row.
//
// THAT VOUCHING IS THE CALLER'S JOB, NOT THIS FUNCTION'S.
// -----------------------------------------------------------------------------
// >>> WRAP ONLY A GUARANTEED-CONTEXT READ. <<<
//
// "Guaranteed" means the read is scoped to identity the caller ALREADY
// authenticated moments earlier in the same request — the authenticated
// player's own `golf_players` row, the authenticated user's own membership
// row on a team it just resolved as active, a round the action just created
// and is immediately re-selecting. If there is any legitimate path through
// which the row would not exist yet (a brand-new player mid-onboarding, an
// optional profile section, a round the player has genuinely never started),
// wrapping that read here manufactures a warning-tier admin_events row every
// single time that ordinary, expected empty state occurs — the exact noise
// `EXPECTED_EMPTY_STATE_CODES` (src/lib/view-state/expected-empty-states.ts)
// exists to prevent. When in doubt, don't wrap it.
// -----------------------------------------------------------------------------
//
// EMITS-ONCE SEMANTICS: keyed on `${action}:${table}` through the shared
// Helm Bridge flood-collapse throttle (src/lib/admin/emit-throttle.ts) — the
// SAME module observeActionSoftFailure and maybeCaptureRlsDenial's storm
// tracker already use. A hot loop re-running the identical guaranteed-context
// read collapses to at most one admin_events row per throttle window, with
// `metadata.collapsed_count` carrying how many were suppressed since — never
// one row per call.
//
// Never changes the result: the SAME `result` object is returned, unmutated,
// whether or not anything was logged. Fire-and-forget — the log write never
// blocks or can fail the caller's read.
// -----------------------------------------------------------------------------
//
// STATUS (2026-08-26): intentionally NOT wired into any call site yet.
//
// The archetype call site — a read of the caller's own active team
// membership, immediately after their auth check — was evaluated against
// src/app/golf/actions/roster.ts and rejected. removePlayerFromTeamImpl's
// membership check (`golf_team_members` by `player_id`+`team_id`) does not
// filter on `status`, but the RLS predicate that would gate the coach's
// subsequent read of that player's `golf_players` row —
// `user_is_coach_of_golf_player()` — requires `status = 'active'` (verified
// against production: both are `SECURITY DEFINER` functions read via
// `pg_get_functiondef`). A coach removing a player whose membership row is
// any other status (e.g. still pending) would see a real, legitimate empty
// read there — exactly the false-positive this module's own header warns
// against manufacturing. Nothing else in roster.ts or messages.ts clears the
// "guaranteed" bar either: the remaining reads either check role membership
// that can legitimately be absent for a non-coach caller, or (in
// messages.ts's resolveGolfTeamAudience) run entirely through the
// service-role admin client, which bypasses RLS and so cannot exhibit the
// silent-RLS-empty-result shape this module exists to catch.
//
// First genuinely intended call site: the authenticated caller's own
// `golf_players` row, read by `user_id = auth.uid()` — the unconditional
// first clause of the `golf_players_select` RLS policy, with no team/status
// predicate attached. `submitGolfRoundComprehensiveImpl`
// (src/app/golf/actions/golf.ts, the player-resolution read right after the
// auth check) reads exactly this row today, but via `.single()`, which
// already turns a zero-row result into an explicit PostgREST error
// (`PGRST116`) rather than the silent `{ data: null, error: null }` shape
// this module targets — a different, already-handled signal. Wiring
// `expectRows` there would require switching that call to `.maybeSingle()`
// first, which is a behavior change outside this module's scope to make
// unilaterally.
// =============================================================================

import 'server-only';

import { logServerEvent } from '@/lib/server-error-logger';
import { shouldEmit, drainCollapsedCount } from '@/lib/admin/emit-throttle';
import type { FeatureKey } from '@/lib/admin/feature-registry';

/** The minimal shape of a raw Supabase/PostgREST query result this wraps. */
export interface ExpectRowsResult<T> {
  data: T | null;
  error: { code?: string | null; message?: string | null } | null;
}

export interface ExpectRowsContext {
  /** Stable action name — becomes part of the throttle key and the log's `action`. */
  action: string;
  featureArea: string;
  feature?: FeatureKey;
  /** The table this read targeted — becomes part of the throttle key and the log message. */
  table: string;
  userId?: string | null;
  teamId?: string | null;
  playerId?: string | null;
  metadata?: Record<string, unknown>;
}

/** True for `null`/`undefined` or an empty array; a populated array or a non-null object is NOT empty. */
function isEmptyData<T>(data: T | null | undefined): boolean {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data)) return data.length === 0;
  return false;
}

/**
 * Wrap a guaranteed-context read's `{ data, error }` result. When the query
 * came back with NO error and NO rows, emits a `source: 'rls_denial'`
 * admin_events row at 'warning' (fire-and-forget, never awaited by the
 * caller) and returns `result` completely unchanged either way.
 *
 * A real Postgres error (`result.error` set) is NOT this function's concern
 * — that is an explicit rejection maybeCaptureRlsDenial already classifies;
 * expectRows only ever fires on the SILENT empty-result shape a blocked
 * SELECT actually produces. See the module header before adding a new call
 * site: this must only wrap a read whose own auth context guarantees rows.
 */
export function expectRows<T>(
  result: ExpectRowsResult<T>,
  ctx: ExpectRowsContext,
): ExpectRowsResult<T> {
  if (result.error) return result;
  if (!isEmptyData(result.data)) return result;

  const throttleKey = `expect_rows:${ctx.action}:${ctx.table}`;
  if (shouldEmit(throttleKey)) {
    const collapsedCount = drainCollapsedCount(throttleKey);
    void logServerEvent(
      `RLS denial (empty guaranteed-context read): ${ctx.table} returned no rows for ${ctx.action}`,
      {
        action: ctx.action,
        source: 'rls_denial',
        featureArea: ctx.featureArea,
        feature: ctx.feature,
        sport: 'golf',
        userId: ctx.userId ?? null,
        teamId: ctx.teamId ?? null,
        playerId: ctx.playerId ?? null,
        // A silent empty result is a weaker signal than an explicit 42501 —
        // keep it admin-feed-only rather than opening a Sentry issue.
        skipSentry: true,
        metadata: {
          table: ctx.table,
          ...(collapsedCount > 0 ? { collapsed_count: collapsedCount } : {}),
          ...ctx.metadata,
        },
      },
      'warning',
    ).catch(() => {});
  }

  return result;
}
