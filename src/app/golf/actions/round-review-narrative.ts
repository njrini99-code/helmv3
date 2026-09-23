'use server';

/**
 * Round-review narrative — a 3-5 sentence LLM-authored paragraph for the
 * Round Review page, generated lazily once a `golf_round_reviews` row
 * exists and cached on that row's `ai_narrative` column (migration
 * 20260923100000_round_recap_single_flight_lock.sql — folded in place with
 * the shared single-flight lock so neither piece can land half-applied).
 *
 * Gated end-to-end behind `coachhelm_round_review_narrative` (default off
 * everywhere): the flag is checked FIRST, before any DB read tied to
 * generation, so flag-off is zero cost — no golf_rounds/golf_round_reviews
 * read, no lock claim, no LLM call. `src/lib/coachhelm/v3/llm/round-review-narrative.ts`
 * owns the prompt/compose() call; this file owns auth, the "never overwrite
 * a published or coach-annotated review" guard, the single-flight lock
 * (kind = 'round_review_narrative', reusing round-recap.ts's lock table),
 * and the guarded persist.
 *
 * Prod does not have `ai_narrative` yet (the migration ships unapplied,
 * same as round-recap.ts's lock) and `src/lib/types/database.ts` has not
 * been regenerated for it — every read/write of the column below casts
 * through `(x as any)`, matching round-recap.ts's own precedent for its
 * own not-yet-applied schema, so this file compiles against the CURRENT
 * generated types.
 *
 * NEVER OVERWRITE a published or coach-annotated review: "coach-annotated"
 * means `coach_notes` OR `coach_feedback_text` OR `coach_rating` is set —
 * deliberately NOT `coach_viewed_at` (a coach merely opening the review
 * must not freeze it). Both the read guard below and the persisting
 * UPDATE's own WHERE clause enforce this, so a race between "we read
 * clean" and "the coach annotates a second later" still can't win: the
 * UPDATE's WHERE is the actual source of truth, the read guard is just the
 * cheap early-exit that skips the LLM call entirely in the common case.
 *
 * NULL-status trap: `status` is nullable and Postgres `<>` does not match
 * NULL, so a plain `.neq('status', 'published')` predicate would silently
 * exclude every NULL-status row from ever being written (the guard would
 * think it's blocked; it is not — only 'published' blocks). Every status
 * check in this file treats "not literally 'published'" (NULL included) as
 * allowed, via `.or('status.is.null,status.neq.published')` on the write
 * and a plain `=== 'published'` check (not `!== 'published'`) on the read.
 *
 * RLS note (for the PR body, not enforced here): `golf_round_reviews`'s
 * existing RLS lets the owning player UPDATE their own row directly, so a
 * player could in principle write `ai_narrative` themselves via PostgREST
 * — no worse than the `summary`/`coach_notes` columns already on this row
 * today. This server action is the only code path that SETS
 * `ai_narrative` from a real generation.
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isFlagEnabled } from '@/lib/flags';
import { verifyPlayerAccess } from '@/lib/auth/verify-player-access';
import { gateUserAction, LLM_COMPOSE_RATE_LIMIT } from '@/lib/auth/action-rate-limit';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { pct } from '@/lib/golf/stat-formulas';
import { acquireRoundLockOrWait, type RoundLockOutcome } from '@/lib/coachhelm/round-single-flight-lock';
import { composeRoundReviewNarrative } from '@/lib/coachhelm/v3/llm/round-review-narrative';

interface RoundContext {
  id: string;
  player_id: string;
  status: string | null;
  course_name: string | null;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways: number | null;
  total_fairways_hit: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
}

interface ReviewGuardRow {
  status: string | null;
  ai_narrative: string | null;
  coach_notes: string | null;
  coach_feedback_text: string | null;
  coach_rating: number | null;
}

export interface RoundReviewNarrativeResult {
  narrative: string | null;
  cached: boolean;
}

const NOT_GENERATED: RoundReviewNarrativeResult = { narrative: null, cached: false };

/** A coach-annotated review must never be silently overwritten —
 *  `coach_viewed_at` deliberately excluded, see the file header. */
function isCoachAnnotated(row: ReviewGuardRow): boolean {
  return row.coach_notes !== null || row.coach_feedback_text !== null || row.coach_rating !== null;
}

/** NULL-status trap: only a LITERAL 'published' blocks — see file header. */
function isPublished(row: ReviewGuardRow): boolean {
  return row.status === 'published';
}

async function getRoundReviewNarrativeImpl(roundId: string): Promise<RoundReviewNarrativeResult> {
  // Checked FIRST — zero DB/RPC/LLM work while off, so the flag truly
  // gates the whole surface, not just the generation half of it.
  if (!isFlagEnabled('coachhelm_round_review_narrative')) return NOT_GENERATED;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NOT_GENERATED;

  const { data: round, error: roundError } = await supabase
    .from('golf_rounds')
    .select(
      'id, player_id, status, course_name, round_type, total_score, score_to_par, total_putts, total_fairways, total_fairways_hit, total_gir, total_gir_possible',
    )
    .eq('id', roundId)
    .maybeSingle<RoundContext>();
  if (roundError) {
    await logServerError(
      `Round-review narrative: round lookup failed: ${describeError(roundError)}`,
      { action: 'getRoundReviewNarrative.roundLookup', featureArea: 'round_review_ai', roundId, userId: user.id, skipSentry: true },
      'warning',
    );
    return NOT_GENERATED;
  }
  if (!round) return NOT_GENERATED;
  if (round.status !== 'completed') return NOT_GENERATED;

  const access = await verifyPlayerAccess(round.player_id, user.id, supabase);
  if (!access.allowed) return NOT_GENERATED;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: review, error: reviewError } = await (supabase as any)
    .from('golf_round_reviews')
    .select('status, ai_narrative, coach_notes, coach_feedback_text, coach_rating')
    .eq('round_id', roundId)
    .maybeSingle();
  if (reviewError) {
    await logServerError(
      `Round-review narrative: review lookup failed: ${describeError(reviewError)}`,
      { action: 'getRoundReviewNarrative.reviewLookup', featureArea: 'round_review_ai', roundId, userId: user.id, skipSentry: true },
      'warning',
    );
    return NOT_GENERATED;
  }
  const reviewRow = review as ReviewGuardRow | null;
  // No review yet for this round — the narrative augments an EXISTING
  // review row; it never triggers the (much more expensive) review
  // compute itself.
  if (!reviewRow) return NOT_GENERATED;
  if (reviewRow.ai_narrative) return { narrative: reviewRow.ai_narrative, cached: true };
  if (isPublished(reviewRow) || isCoachAnnotated(reviewRow)) return NOT_GENERATED;

  const rateLimit = await gateUserAction(
    'round_review_narrative',
    user.id,
    LLM_COMPOSE_RATE_LIMIT,
    'Too many narrative requests — please wait a moment and try again.',
  );
  if (!rateLimit.allowed) return NOT_GENERATED;

  const lock = await acquireNarrativeLockOrWait(roundId, user.id);
  if (lock.outcome === 'resolved') {
    // A concurrent winner's result materialized while this call waited —
    // this call made no LLM call and read ONLY the narrative's own
    // storage (never round-recap.ts's golf_rounds.ai_recap — see
    // pollForResult below).
    return { narrative: lock.value, cached: true };
  }
  if (lock.outcome === 'fail-closed') {
    // Same reasoning as round-recap.ts: no LLM call, and deliberately no
    // deterministic persist either — that would win the UPDATE's own
    // `ai_narrative IS NULL` race against a winner still genuinely in
    // flight, permanently discarding the paid LLM call. A later render
    // just tries again.
    return NOT_GENERATED;
  }

  try {
    return await runNarrativeGeneration(roundId, round, user.id, supabase);
  } finally {
    await lock.release();
  }
}

async function runNarrativeGeneration(
  roundId: string,
  round: RoundContext,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<RoundReviewNarrativeResult> {
  const { data: playerRow, error: playerError } = await supabase
    .from('golf_players')
    .select('first_name')
    .eq('id', round.player_id)
    .maybeSingle<{ first_name: string | null }>();
  if (playerError) {
    await logServerError(
      `Round-review narrative: player-name lookup failed (continuing as "the player"): ${describeError(playerError)}`,
      { action: 'getRoundReviewNarrative.playerName', featureArea: 'round_review_ai', roundId, userId, skipSentry: true },
      'warning',
    );
  }
  const playerName = promptSafeName(playerRow?.first_name);
  const fallback = buildDeterministicNarrative(round, playerName);

  const coachId = await resolveBillingCoachId(supabase, round.player_id);

  let text: string | null;
  if (coachId === null) {
    // DS-44 (v3/llm.ts): a null coach_id skips compose()'s budget gate
    // entirely and buys an unmetered call. Never pass it through — skip
    // the LLM call outright and cache the deterministic fallback, same
    // as v3/llm.ts's refuseUnbilledCompose() does for its own callers.
    text = fallback;
  } else {
    const outcome = await composeRoundReviewNarrative({
      player_id: round.player_id,
      coach_id: coachId,
      player_first_name: playerName,
      total_score: round.total_score ?? 0,
      score_to_par: round.score_to_par ?? 0,
      course_name: round.course_name,
      round_type: round.round_type,
      total_putts: round.total_putts,
      fairways_hit: round.total_fairways_hit,
      fairways_total: round.total_fairways,
      gir: round.total_gir,
      gir_total: round.total_gir_possible,
      fallback_narrative: fallback,
    });
    const trimmed = outcome.text.trim();
    text = trimmed.length >= 40 && trimmed.length <= 800 ? trimmed : fallback;
  }

  const admin = createAdminClient();
  // Guarded persist: all five predicates must hold, or this call's write
  // touches zero rows and the actual current value is re-read instead —
  // never this call's own (possibly discarded) text. See file header for
  // why `status` is checked with `.or(...)`, not `.neq(...)`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: updateError } = await (admin as any)
    .from('golf_round_reviews')
    .update({ ai_narrative: text })
    .eq('round_id', roundId)
    .is('ai_narrative', null)
    .is('coach_notes', null)
    .is('coach_feedback_text', null)
    .is('coach_rating', null)
    .or('status.is.null,status.neq.published')
    .select('ai_narrative')
    .maybeSingle();

  if (updateError) {
    await logServerError(
      `Round-review narrative persist failed: ${describeError(updateError)}`,
      { action: 'getRoundReviewNarrative.persist', featureArea: 'round_review_ai', roundId, userId, skipSentry: false },
      'warning',
    );
    return NOT_GENERATED;
  }

  if (updated) {
    return { narrative: (updated as { ai_narrative: string | null }).ai_narrative, cached: false };
  }

  // Zero rows touched: either a concurrent winner already wrote it, or the
  // review became published/annotated between the read guard above and
  // this UPDATE. Either way, re-read what's ACTUALLY stored — never this
  // call's own text, which may have lost that race or been correctly
  // refused.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: current, error: rereadError } = await (admin as any)
    .from('golf_round_reviews')
    .select('ai_narrative')
    .eq('round_id', roundId)
    .maybeSingle();
  if (rereadError) {
    await logServerError(
      `Round-review narrative re-read after a zero-row update failed: ${describeError(rereadError)}`,
      { action: 'getRoundReviewNarrative.reread', featureArea: 'round_review_ai', roundId, userId, skipSentry: true },
      'warning',
    );
    return NOT_GENERATED;
  }
  const currentNarrative = (current as { ai_narrative: string | null } | null)?.ai_narrative ?? null;
  return { narrative: currentNarrative, cached: currentNarrative !== null };
}

// --- Single-flight lock (reuses round-recap.ts's migration, kind = 'round_review_narrative') ---

/** No "narrative revision" concept exists today — same reasoning as
 *  round-recap.ts's own ROUND_RECAP_LOCK_REVISION constant. */
const NARRATIVE_LOCK_REVISION = 1;

/** A paragraph costs one compose() call + one possible retry, same shape
 *  as round-recap.ts's own worst case — same TTL. */
const NARRATIVE_LOCK_TTL_SECONDS = 45;
const NARRATIVE_LOCK_WAIT_MS = 6_000;
const NARRATIVE_LOCK_POLL_INTERVAL_MS = 400;

/**
 * Polls `golf_round_reviews.ai_narrative` specifically — the narrative's
 * OWN storage, never round-recap.ts's `golf_rounds.ai_recap`. A narrative
 * waiter that "resolved" by reading the recap's text would hand back the
 * wrong feature's prose as if it were this one's — exactly the failure
 * mode the kind-scoped lock (and this dedicated poll target) exists to
 * prevent.
 */
async function acquireNarrativeLockOrWait(roundId: string, userId: string): Promise<RoundLockOutcome<string>> {
  return acquireRoundLockOrWait<string>({
    roundId,
    revision: NARRATIVE_LOCK_REVISION,
    kind: 'round_review_narrative',
    ttlSeconds: NARRATIVE_LOCK_TTL_SECONDS,
    waitMs: NARRATIVE_LOCK_WAIT_MS,
    pollIntervalMs: NARRATIVE_LOCK_POLL_INTERVAL_MS,
    userId,
    logActionPrefix: 'getRoundReviewNarrative.lock',
    logFeatureArea: 'round_review_ai',
    pollForResult: async () => {
      const admin = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (admin as any)
        .from('golf_round_reviews')
        .select('ai_narrative')
        .eq('round_id', roundId)
        .maybeSingle();
      if (error) return { value: null, error };
      const narrative = (data as { ai_narrative: string | null } | null)?.ai_narrative;
      return { value: narrative ?? null };
    },
  });
}

// --- Helpers ---------------------------------------------------------------

/** Same cleaning rule round-recap.ts applies before placing a player's name
 *  inside a prompt: quotes/backticks stripped, whitespace collapsed, capped,
 *  never empty. Apostrophes stay — D'Angelo is D'Angelo. */
function promptSafeName(raw: string | null | undefined): string {
  const cleaned = (raw ?? '').replace(/["`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return cleaned || 'the player';
}

/**
 * Resolve the coach to bill the LLM spend against — the player's first
 * active team's primary coach, or null when none is on file. Mirrors
 * round-recap.ts's own `resolveBillingCoachId` (kept as a separate copy
 * rather than exported/shared, so a future change to one surface's billing
 * resolution can't silently change the other's).
 */
async function resolveBillingCoachId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
): Promise<string | null> {
  const { data: membership, error: membershipError } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (membershipError) {
    await logServerError(
      `Round-review narrative: billing coach team lookup failed: ${describeError(membershipError)}`,
      { action: 'getRoundReviewNarrative.resolveBillingCoach', featureArea: 'round_review_ai', playerId, skipSentry: true },
      'warning',
    );
    return null;
  }
  if (!membership?.team_id) return null;

  const { data: staff, error: staffError } = await supabase
    .from('golf_team_coach_staff')
    .select('coach_id')
    .eq('team_id', membership.team_id)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle();
  if (staffError) {
    await logServerError(
      `Round-review narrative: billing coach staff lookup failed: ${describeError(staffError)}`,
      { action: 'getRoundReviewNarrative.resolveBillingCoach', featureArea: 'round_review_ai', playerId, skipSentry: true },
      'warning',
    );
    return null;
  }
  return staff?.coach_id ?? null;
}

// --- Deterministic fallback --------------------------------------------------

function buildDeterministicNarrative(round: RoundContext, playerName: string): string {
  const stp = round.score_to_par ?? 0;
  const score = round.total_score ?? 0;
  const fir =
    round.total_fairways_hit !== null && round.total_fairways !== null
      ? pct(round.total_fairways_hit, round.total_fairways)
      : null;
  const gir =
    round.total_gir !== null && round.total_gir_possible !== null
      ? pct(round.total_gir, round.total_gir_possible)
      : null;

  const opener = round.course_name
    ? `${playerName} shot ${score} at ${round.course_name}.`
    : `${playerName} shot ${score} this round.`;

  const scoreLine =
    stp === 0
      ? 'That squares the card at even par.'
      : stp < 0
        ? `That is ${Math.abs(stp)} under par, ahead of the field's usual pace.`
        : `That is ${stp} over par.`;

  const statLines: string[] = [];
  if (round.total_putts !== null) statLines.push(`The putter logged ${round.total_putts} strokes on the day.`);
  if (fir !== null) statLines.push(`${fir}% of fairways were found off the tee.`);
  if (gir !== null) statLines.push(`Greens in regulation landed at ${gir}%.`);

  const takeaway =
    gir !== null && gir < 50
      ? 'Tighter approach play is the clearest opening for the next round.'
      : fir !== null && fir < 50
        ? 'A more consistent tee shot would compound the gains made elsewhere.'
        : 'Carrying this into the next round is the next test.';

  return [opener, scoreLine, statLines[0], takeaway].filter(Boolean).join(' ');
}

const observedGetRoundReviewNarrative = withAdminObserved(
  'getRoundReviewNarrative',
  {
    sport: 'golf',
    feature: 'round_review_ai',
    contextFrom: ([roundId]) => ({ roundId }),
  },
  getRoundReviewNarrativeImpl,
);

export async function getRoundReviewNarrative(roundId: string): Promise<RoundReviewNarrativeResult> {
  return observedGetRoundReviewNarrative(roundId);
}
