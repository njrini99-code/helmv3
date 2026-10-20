'use server';

/**
 * v3 LLM server actions.
 *
 * `generateHeroNarrative` (W31) is the live action here. The W30
 * `generateLlmRoundReview` action and its composer
 * (`src/lib/coachhelm/v3/llm/round-review.ts`, `composeRoundReview`, an
 * 80-150 word paragraph) were deleted as dead code (CoachHelm deep audit row
 * 45): the action had zero callers, and it shared the 'round_review' task key
 * with the live round recap, which blurred that surface's spend and
 * verification telemetry. The round-review narrative is
 * `round-review-narrative.ts` (task 'round_review_narrative').
 */

import { createClient } from '@/lib/supabase/server';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { composeHeroNarrative } from '@/lib/coachhelm/v3/llm/hero-narrative';
import { loadAlertPostureForPlayer } from '@/lib/coachhelm/v3/intent/loader';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { describeError } from '@/lib/utils/describe-error';
import { gateUserAction, LLM_COMPOSE_RATE_LIMIT } from '@/lib/auth/action-rate-limit';
import { verifyPlayerAccess } from '@/lib/auth/verify-player-access';

// ---------------------------------------------------------------------------
// W31 — Hero narrative for the player dashboard
// ---------------------------------------------------------------------------

export interface HeroNarrativeInput {
  /** Player whose dashboard is rendering this. Must match the authed
   *  player (or be a coach viewing-as the player). */
  player_id: string;
  metric_label: string;
  your_value_display: string;
  team_pct: number | null;
  goal_target_display?: string;
  counterfactual_strokes_per_round?: number;
  fallback_text: string;
}

export interface LlmHeroNarrativeActionResult {
  ok: boolean;
  text?: string;
  used_llm?: boolean;
  citations_verified?: boolean;
  cost_usd?: number;
  error?: string;
}

async function generateHeroNarrativeImpl(
  input: HeroNarrativeInput,
): Promise<LlmHeroNarrativeActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    // DS-44 (rate): this is the sharper of the two primitives — almost the
    // whole prompt is caller-supplied — so cap per-user frequency here and
    // gate the spend on a resolvable billing owner below.
    const rateLimit = await gateUserAction(
      'v3llm',
      user.id,
      LLM_COMPOSE_RATE_LIMIT,
      'Too many requests. Please wait a moment and try again.',
    );
    if (!rateLimit.allowed) return { ok: false, error: rateLimit.error };

    // ...and the same missing access check as the (since deleted) round-review action, which matters more
    // here: `player_id` is the caller's own argument rather than a field read
    // off an authorized row, so any authenticated team member could generate
    // narrative for any teammate and consume that player's coach's LLM budget
    // doing it.
    const access = await verifyPlayerAccess(input.player_id, user.id, supabase);
    if (!access.allowed) {
      return {
        ok: false,
        error: access.reason === 'unavailable'
          ? 'Could not verify access just now. Please try again.'
          : 'Unauthorized',
      };
    }

    const { data: player } = await supabase
      .from('golf_players')
      .select('id, first_name')
      .eq('id', input.player_id)
      .maybeSingle();
    if (!player) return { ok: false, error: 'Player not found' };

    // DS-44 (spend): billing-owner gate below.
    const billing = await resolveBillingCoach(supabase, input.player_id);
    if (billing.coach_id === null) {
      return await refuseUnbilledCompose(
        'v3.llm.generateHeroNarrative',
        billing.reason,
        input.player_id,
        input.fallback_text,
      );
    }
    const billing_coach_id: string = billing.coach_id;

    // W27 — load narrative_goal so the LLM can adjust tone.
    const intentResult = await loadAlertPostureForPlayer(input.player_id);

    const result = await composeHeroNarrative({
      player_id: input.player_id,
      coach_id: billing_coach_id,
      player_first_name: player.first_name ?? 'Player',
      top_insight: {
        metric_label: input.metric_label,
        your_value_display: input.your_value_display,
        team_pct: input.team_pct,
      },
      goal: input.goal_target_display
        ? { target_display: input.goal_target_display }
        : undefined,
      counterfactual_strokes_per_round: input.counterfactual_strokes_per_round,
      fallback_text: input.fallback_text,
      narrative_goal: intentResult?.narrative_goal,
    });

    return {
      ok: true,
      text: result.text,
      used_llm: result.used_llm,
      citations_verified: result.citations_verified,
      cost_usd: result.cost_usd,
    };
  } catch (err) {
    await logServerError(
      `generateHeroNarrative failed: ${describeError(err)}`,
      { action: 'v3.llm.generateHeroNarrative' },
    );
    return { ok: false, error: 'Internal error' };
  }
}

const observedGenerateHeroNarrative = withAdminObserved(
  'generateHeroNarrative',
  { sport: 'golf', feature: 'round_review_ai' },
  generateHeroNarrativeImpl,
);

export async function generateHeroNarrative(input: HeroNarrativeInput): Promise<LlmHeroNarrativeActionResult> {
  return observedGenerateHeroNarrative(input);
}

// ---------------------------------------------------------------------------
// Internal: billing-owner resolution + the fail-closed refusal (DS-44).
//
// THE HOLE THIS CLOSES. compose() enforces the daily budget only inside
// `if (req.coach_id)` (src/lib/coachhelm/v3/llm/compose.ts) — a null coach_id
// is treated as a trusted system job, skips checkBudget() AND recordSpend(),
// and buys a completely unmetered model call. The actions in this file used
// to hand compose() whatever the primary-coach lookup returned, including
// null, so any player the lookup could not attribute (no active team
// membership, or an active team carrying no coach staff row) was an
// uncapped-spend path. The per-user rate limiter added above bounds how OFTEN
// that happens; it does not bound the bill, because the bill is per-call and
// the limiter has no notion of dollars.
//
// The fix is in this file rather than in compose(), because compose() is
// shared with genuine system jobs that legitimately pass coach_id=null, and
// widening its gate would need a platform-level budget row that does not
// exist. What IS correct here is that a player-initiated request always has
// an owner or must not be served: we prefer the team's primary coach, accept
// any coach on the same team as a defensible fallback owner (the spend is the
// team's either way), and otherwise refuse.
//
// Measured on prod 2026-08-01: all 13 teams have a primary coach, so the
// any-staff tier currently changes nothing and exists as defence in depth;
// 10 of 61 players have no active membership and are exactly the callers that
// were previously unmetered — they now get the deterministic template.
// ---------------------------------------------------------------------------

// Use ReturnType to inherit Database<T> from the project's server helper
// without re-importing the @supabase/supabase-js generic.
type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/** Why a player-initiated LLM call has no coach to bill. */
type NoBillingOwnerReason = 'no_active_team' | 'no_team_coach';

type BillingOwner =
  | { coach_id: string }
  | { coach_id: null; reason: NoBillingOwnerReason };

async function resolveBillingCoach(
  supabase: ServerSupabase,
  playerId: string,
): Promise<BillingOwner> {
  // golf_players has no team_id; the join goes through golf_team_members.
  const { data: membership } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (!membership?.team_id) return { coach_id: null, reason: 'no_active_team' };

  // Primary coach first, then any coach on the team. Ordered rather than
  // filtered on is_primary so a team whose primary flag was never set still
  // has an owner. The trailing keys make the choice deterministic — two calls
  // for the same team must always debit the same budget row, otherwise the
  // per-coach daily cap is trivially doubled by alternating owners.
  const { data: staff } = await supabase
    .from('golf_team_coach_staff')
    .select('coach_id')
    .eq('team_id', membership.team_id)
    .order('is_primary', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: true, nullsFirst: false })
    .order('coach_id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!staff?.coach_id) return { coach_id: null, reason: 'no_team_coach' };
  return { coach_id: staff.coach_id };
}

/**
 * Refuse an LLM call that nobody can be billed for.
 *
 * Returns the caller's deterministic template in exactly the shape compose()
 * returns on budget exhaustion (`ok`, `used_llm:false`, `citations_verified:
 * false`, `cost_usd: 0`), so every existing consumer degrades down the path it
 * already handles — HeroNarrativeCard, for one, only swaps in prose when
 * `ok && used_llm && citations_verified`, so this renders the fallback with no
 * error state. No model call is made.
 */
async function refuseUnbilledCompose(
  action: string,
  reason: NoBillingOwnerReason,
  playerId: string,
  fallbackText: string,
): Promise<{
  ok: true;
  text: string;
  used_llm: false;
  citations_verified: false;
  cost_usd: 0;
}> {
  await logServerEvent(
    `LLM compose refused: no billing coach for player_id=${playerId} (${reason}); served the deterministic template instead`,
    {
      action,
      sport: 'golf',
      feature: 'round_review_ai',
      playerId,
      errorCode: `llm_unbilled_${reason}`,
      // Routine handled degradation, not a bug: the player still gets real
      // prose. Keep it in the admin feed without opening a Sentry issue on
      // every dashboard mount for the players this affects.
      skipSentry: true,
      extra: { reason },
    },
    'warning',
  );
  return {
    ok: true,
    text: fallbackText,
    used_llm: false,
    citations_verified: false,
    cost_usd: 0,
  };
}
