'use server';

/**
 * A4 slice 3b — Round Review mount of the sequence-attribution rollup
 * (addendum §13, work package A4). Read-only, decorative: this section
 * must never affect what a coach or player can do on the page, only what
 * they can additionally see.
 *
 * Flag-gated (`coachhelm_a4_sequence_attribution_surface`, default off —
 * see `config/feature-flags.yml`) and the flag check runs FIRST, before
 * any client construction or Supabase call, so the flag-off path makes
 * ZERO DB calls (see `getRoundReviewSequenceAttribution.flagOff.test.ts`).
 *
 * Auth mirrors `round-review-system.ts`'s `getPlayerStandingForReview`
 * ('player_or_coach' mode): the caller must be the player (self) or a
 * coach on a team the player is an active member of
 * (`verifyPlayerAccess`). Uses the SESSION-scoped `supabase` client (never
 * admin) so RLS still applies exactly as it does for every other read on
 * this page.
 */
import { createClient } from '@/lib/supabase/server';
import { isFlagEnabled } from '@/lib/flags';
import { verifyPlayerAccess } from '@/lib/auth/verify-player-access';
import { buildRollingSequenceAttributionScope } from '@/lib/coachhelm/v3/metrics/sequence-attribution-window';
import { loadSequenceAttribution } from '@/lib/coachhelm/v3/metrics/load-sequence-attribution';
import type { MetricResult } from '@/lib/coachhelm/v3/metrics/types';
import { withAdminObserved } from '@/lib/admin/observed-action';

const SEQUENCE_ATTRIBUTION_FLAG = 'coachhelm_a4_sequence_attribution_surface';

// UUID format validation — mirrors round-review-system.ts's own guard.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Returns the player's rolling-12-month sequence-attribution rollup, or
 * `null` when: the flag is off, the id is malformed, the caller isn't
 * authenticated, the caller isn't authorized to view this player, or the
 * underlying read failed (`loadSequenceAttribution` already logs that case
 * and returns `null` itself). Never `[]` for a failure — `[]` is reserved
 * for "computed successfully, no rows" (not reachable here in practice
 * since `computeSequenceAttribution` always emits the coverage row, but the
 * type keeps that distinction honest for any future caller). The Round
 * Review page treats `null` as "hide the section", exactly like every
 * other best-effort addendum on this page.
 */
async function getRoundReviewSequenceAttributionImpl(playerId: string): Promise<MetricResult[] | null> {
  const enabled = isFlagEnabled(SEQUENCE_ATTRIBUTION_FLAG);
  if (!enabled) return null;

  if (!isValidUuid(playerId)) return null;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const access = await verifyPlayerAccess(playerId, user.id, supabase);
  if (!access.allowed) return null;

  const scope = buildRollingSequenceAttributionScope(playerId);
  return loadSequenceAttribution(scope, { supabase });
}

// Mirrors round-review-system.ts's getPlayerStandingForReview — same page,
// same 'player_or_coach' auth pattern, same withAdminObserved feature.
// Never demoSafe: this is a read, and guarding a read would break the demo
// tour itself (see observed-action.ts's demoSafe doc comment). Neither the
// flag-off `null` nor a successful `MetricResult[]` result is an object
// with `success`/`ok`/`error` fields, so extractActionSoftFailure never
// matches here and the wrapper never makes its own resolveObservedUser()
// call on the flag-off path — the "ZERO DB calls when the flag is off"
// contract this file documents above is unaffected by this wrap.
const observedGetRoundReviewSequenceAttribution = withAdminObserved(
  'getRoundReviewSequenceAttribution',
  { sport: 'golf', feature: 'round_review_ai' },
  getRoundReviewSequenceAttributionImpl,
);

export async function getRoundReviewSequenceAttribution(playerId: string): Promise<MetricResult[] | null> {
  return observedGetRoundReviewSequenceAttribution(playerId);
}
