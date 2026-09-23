'use server';

/**
 * A9 slice 3 (repair-plan §14.12): server-action layer for the coach-facing
 * outcome-attribution readout. This is where the
 * `coachhelm_comparable_opportunity_attribution` flag is checked — the DB
 * loader (`attribution-read.ts`) and the view model
 * (`attribution-view-model.ts`) are both flag-unaware pure/DB modules, same
 * separation `causality/comparable-attribute.ts` keeps from its cron
 * wiring.
 *
 * FLAG OFF → NO DB CALL AT ALL: the flag check is the very first line, before
 * `createClient()` or any Supabase call. `isFlagEnabled` itself makes no
 * network call (it evaluates the generated in-process registry — see
 * `src/lib/flags/is-enabled.ts`), so an off flag returns `null` having
 * touched nothing but that in-memory check.
 *
 * FAILED READ → `null`, NEVER AN EMPTY READOUT: a `{ ok: false }` from the
 * loader (a real infra failure) returns `null` here, same as the flag-off
 * case — the Fairway component (`AttributionReadout.tsx`) renders nothing
 * for either, which is the correct, non-alarming behavior for an infra
 * blip. A legitimate "never attributed yet" is `{ state: 'missing' }`,
 * still a real (non-null) readout the component CAN choose to render —
 * see that component's own doc comment for what it does with each state.
 *
 * No migration is applied by this slice. Migration 20260922230000
 * (`method_version`) stays unapplied in production; `attribution-read.ts`'s
 * own unknown-column degrade keeps this action working (reading `null`
 * method_version for every row) whether or not the column exists.
 */
import { createClient } from '@/lib/supabase/server';
import { isFlagEnabled } from '@/lib/flags';
import { verifyPlayerAccess } from '@/lib/auth/verify-player-access';
import { readAttributionForInsight, readAttributionForPlayer } from '@/lib/coachhelm/v3/effectiveness/attribution-read';
import { toAttributionReadout, rowToAttributionReadout, type AttributionReadout } from '@/lib/coachhelm/v3/effectiveness/attribution-view-model';

const ATTRIBUTION_FLAG = 'coachhelm_comparable_opportunity_attribution';

/**
 * One insight's attribution readout, for the insight-detail surface
 * (`InsightCard`/`AttributionReadout` on `FairwayPlayerInsight.tsx`).
 * `null` = flag off, not authenticated, or a failed read — the caller
 * treats all three identically (render nothing).
 */
export async function getInsightAttributionReadout(insightId: string): Promise<AttributionReadout | null> {
  if (!insightId) return null;
  if (!isFlagEnabled(ATTRIBUTION_FLAG)) return null;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const result = await readAttributionForInsight(supabase, insightId);
  if (!result.ok) return null;

  return toAttributionReadout(result.rows);
}

/**
 * Every attributed insight's readout for one player, keyed by `insight_id`
 * — for a future roster/player-summary surface (not wired to a page in
 * this slice; `getInsightAttributionReadout` above is what's wired into
 * `FairwayPlayerInsight.tsx`'s insight detail). `null` = flag off, not
 * authenticated, not authorized for this player, or a failed read.
 */
export async function getPlayerAttributionReadouts(playerId: string): Promise<Record<string, AttributionReadout> | null> {
  if (!playerId) return null;
  if (!isFlagEnabled(ATTRIBUTION_FLAG)) return null;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const access = await verifyPlayerAccess(playerId, user.id, supabase);
  if (!access.allowed) return null;

  const result = await readAttributionForPlayer(supabase, playerId);
  if (!result.ok) return null;

  const byInsightId: Record<string, AttributionReadout> = {};
  for (const row of result.rows) {
    byInsightId[row.insight_id] = rowToAttributionReadout(row);
  }
  return byInsightId;
}
