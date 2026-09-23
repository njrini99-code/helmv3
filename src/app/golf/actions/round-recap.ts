'use server';

/**
 * Round AI recap — generates a 2-sentence editorial recap for a
 * completed golf round and persists it to `golf_rounds.ai_recap`.
 *
 * Voice and tone:
 *   - Magazine beat-reporter: declarative, concrete, no hype.
 *   - Lead with the one fact that defines the round (best score, putt
 *     trouble, fairways saved the day, finishing kick, etc.).
 *   - Second sentence is forward-looking: what to take into the next
 *     round, framed as a takeaway not a verdict.
 *
 * Provider:
 *   - Default: Vercel AI Gateway via the `ai` SDK using a model string
 *     like `anthropic/claude-haiku-4.5`. Auth is handled by the SDK
 *     automatically through the OIDC token Vercel injects on deploys
 *     (also synced to local via `vercel env pull` — see the project's
 *     `.env.development.local`). No manual credential rotation needed.
 *   - Fallback: a deterministic recap built from round stats and any
 *     active CoachHelm patterns. Used when the gateway is unreachable
 *     (network failure, rate limit, missing OIDC). Same shape, no LLM.
 *
 * The recap is generated lazily — first read of the round detail page
 * after completion fires the generation, persists the result, and
 * subsequent reads return cached text.
 *
 * Render vs. action callers:
 *   - The round detail page (`/golf/dashboard/rounds/[id]`) calls
 *     `generateRoundRecap(roundId)` during Server Component render. Next.js
 *     forbids `revalidatePath` during render (Sentry fingerprint
 *     d0a9265f), and the page doesn't need it anyway — it already has the
 *     freshly generated recap in hand from this same call.
 *   - A real form/action entrypoint (e.g. a future "Regenerate recap"
 *     button, invoked from an event handler rather than render) should pass
 *     `{ revalidate: true }` so the cached route entry is invalidated for
 *     subsequent navigations. `revalidatePath` only runs when explicitly
 *     opted into via that flag — it defaults to off.
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { compose } from '@/lib/coachhelm/v3/llm/compose';
import { buildRecapEvidence, buildRecapEvidencePacket } from '@/lib/coachhelm/v3/llm/recap-evidence';
import { isFlagEnabled } from '@/lib/flags';
import { pct } from '@/lib/golf/stat-formulas';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { verifyPlayerAccess } from '@/lib/auth/verify-player-access';
import { gateUserAction, LLM_COMPOSE_RATE_LIMIT } from '@/lib/auth/action-rate-limit';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { acquireRoundLockOrWait, type RoundLockOutcome } from '@/lib/coachhelm/round-single-flight-lock';

interface RoundContext {
  id: string;
  player_id: string;
  course_name: string | null;
  course_city: string | null;
  course_state: string | null;
  round_date: string;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways: number | null;
  total_fairways_hit: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  holes_played: number | null;
  front_nine: number | null;
  back_nine: number | null;
}

type RoundRow = RoundContext & {
  status: string | null;
  ai_recap: string | null;
  ai_recap_generated_at: string | null;
};

/**
 * A player's first name as it may appear inside the prompt: double quotes and
 * backticks stripped (the instruction quotes it), all whitespace including
 * line breaks collapsed to one space, capped, and never empty. Apostrophes
 * stay — D'Angelo is D'Angelo.
 */
function promptSafeName(raw: string | null | undefined): string {
  const cleaned = (raw ?? '').replace(/["`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return cleaned || 'the player';
}

interface PlayerStatContext {
  scoring_average: number | null;
  best_round: number | null;
  rounds_played: number | null;
}

interface GenerateRoundRecapOptions {
  /**
   * Revalidate the round detail route's cache entry after persisting the
   * recap. Must stay `false` (the default) for any caller invoked during
   * render — Next.js throws if `revalidatePath` runs mid-render. Only a
   * true out-of-render action entrypoint (form action / event handler)
   * should pass `true`.
   */
  revalidate?: boolean;
}

async function generateRoundRecapImpl(
  roundId: string,
  options: GenerateRoundRecapOptions = {},
): Promise<{ recap: string | null; cached: boolean }> {
  const supabase = await createClient();

  // DS: this action had no auth check at all and is directly invocable as a
  // server action independent of the round detail page's own access gate.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { recap: null, cached: false };

  // 1. Fetch round + verify status
  const { data: round } = await supabase
    .from('golf_rounds')
    .select(
      'id, player_id, course_name, course_city, course_state, round_date, round_type, total_score, score_to_par, total_putts, total_fairways, total_fairways_hit, total_gir, total_gir_possible, holes_played, front_nine, back_nine, status, ai_recap, ai_recap_generated_at',
    )
    .eq('id', roundId)
    .maybeSingle<RoundRow>();

  if (!round) return { recap: null, cached: false };

  // DS: golf_rounds SELECT is visible to any teammate via is_golf_team_player,
  // but the UPDATE that persists the recap below is owner/coach-only. Without
  // this gate a teammate (or the shared demo account) could loop this call to
  // force repeated, uncached LLM generations. Same ownership model as the
  // UPDATE RLS policies (golf_rounds_update / _update_coach / _update_team).
  const access = await verifyPlayerAccess(round.player_id, user.id, supabase);
  if (!access.allowed) return { recap: null, cached: false };

  if (round.status !== 'completed') return { recap: null, cached: false };
  if (round.ai_recap) return { recap: round.ai_recap, cached: true };

  // DS: LLM generation is expensive and compose()'s per-team budget gate is
  // skipped entirely when the round's player has no primary coach on file
  // (see resolveBillingCoachId below) — rate-limit per user as a backstop.
  const rateLimit = await gateUserAction(
    'round_recap',
    user.id,
    LLM_COMPOSE_RATE_LIMIT,
    'Too many recap requests — please wait a moment and try again.',
  );
  if (!rateLimit.allowed) return { recap: null, cached: false };

  // Package 8: single-flight lock, taken BEFORE the LLM call — deferred at
  // 20260923080000 as "an owner product/cost decision"; approved here.
  // Gated behind its own flag (default off everywhere) so a missing
  // migration in an environment can never turn "a lock failure fails
  // closed" into "every recap silently stops calling the LLM": with the
  // flag off, this whole block is skipped and behavior is byte-for-byte
  // what it was before this lock existed (only 20260923080000's cheap
  // `ai_recap IS NULL` guard applies). See migration 20260923100000 for
  // the full design rationale (TTL sizing, why a lease table and not
  // pg_advisory_xact_lock, why (round_id, revision)).
  if (isFlagEnabled('coachhelm_recap_single_flight_lock')) {
    const lock = await acquireRecapLockOrWait(roundId, user.id);
    if (lock.outcome === 'resolved') {
      // A concurrent winner's result materialized while this call waited —
      // no LLM call was made by this call.
      return { recap: lock.value, cached: true };
    }
    if (lock.outcome === 'fail-closed') {
      // Either the claim/reclaim RPC itself errored, or the wait was
      // exhausted while a live lease was still held by someone else. In
      // both cases: no LLM call, and — deliberately — no deterministic
      // persist either. Persisting here would win the RPC's own
      // `ai_recap IS NULL` race against a winner that is still genuinely
      // in flight, permanently discarding the paid LLM call this whole
      // lock exists to protect. A later render simply tries again.
      return { recap: null, cached: false };
    }
    try {
      return await runRecapGeneration(roundId, round, user.id, supabase, options);
    } finally {
      await lock.release();
    }
  }

  return runRecapGeneration(roundId, round, user.id, supabase, options);
}

async function runRecapGeneration(
  roundId: string,
  round: RoundRow,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
  options: GenerateRoundRecapOptions,
): Promise<{ recap: string | null; cached: boolean }> {
  // 2. Pull peer context — player's recent stats cache for comparison
  const { data: stats } = await supabase
    .from('golf_player_stats_cache')
    .select('scoring_average, best_round, rounds_played')
    .eq('player_id', round.player_id)
    .maybeSingle<PlayerStatContext>();

  // 2b. The player's own first name, for the prompt. Until 2026-09-02 the
  // prompt named nobody and offered "Nick" as an EXAMPLE of third person, and
  // the model did what examples do: a Shenandoah player's recap opened
  // "Nick's back nine collapse". The name is user data, so it is cleaned
  // (promptSafeName) before it is placed inside the instruction.
  const { data: playerRow, error: playerError } = await supabase
    .from('golf_players')
    .select('first_name')
    .eq('id', round.player_id)
    .maybeSingle<{ first_name: string | null }>();
  if (playerError) {
    // The name is a nicety: the recap still reads correctly as "the player".
    // Logged, not raised, so a broken lookup can neither block the recap nor
    // silently rename every recap without a trace.
    await logServerError(
      `Recap player-name lookup failed (continuing as "the player"): ${playerError.message}`,
      {
        action: 'generateRoundRecap.playerName',
        featureArea: 'round_review_ai',
        roundId,
        playerId: round.player_id,
        userId,
        errorCode: playerError.code,
        errorHint: playerError.hint,
        errorDetails: playerError.details,
        skipSentry: true,
      },
      'warning',
    );
  }
  const playerName = promptSafeName(playerRow?.first_name);

  // 3. Build deterministic fallback first — compose() needs a fallback to
  // return when the budget gate denies, the LLM errors, or citations fail.
  const deterministic = buildDeterministicRecap(round, stats);

  // 4. Resolve the player's primary coach so the budget gate bills the
  // right team. If no primary coach is on file (e.g. unattached player
  // profile), pass null — compose() still logs the call but skips the gate.
  const coachId = await resolveBillingCoachId(supabase, round.player_id);

  // 5. Route the LLM call through the v3 compose() wrapper — same
  // budget gate + golf_coachhelm_llm_calls log + citation verifier as
  // round-review / hero-narrative. Falls back to `deterministic` if
  // gated or on error.
  const outcome = await generateLLMRecap(round, stats, coachId, deterministic, playerName);
  const recap = outcome.text;

  // 6. Persist the derived recap through the dedicated lifecycle RPC. Completed
  // round score history is immutable, so a direct `golf_rounds.update()` is
  // rightly rejected by the guard even though a recap is not a scoring change.
  // The RPC permits precisely the two recap columns, rechecks player/coach
  // access in the database, and records the write under its own lifecycle
  // capability. Do not replace this with a broader completed-round exception.
  // MUST-1 (Package 8, revision-keyed provenance + single-flight, 2026-09-23):
  // the RPC's UPDATE now guards `AND ai_recap IS NULL`, so a call that loses
  // a concurrent generation race for the same round persists nothing and
  // still reports success:true — a pre-existing "success" contract this
  // slice didn't change. The RPC's `persisted` field (added alongside the
  // guard) distinguishes the two cases; see the SHOULD-4 handling below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: persisted, error: persistError } = await (supabase as any).rpc(
    'save_round_ai_recap',
    { p_round_id: roundId, p_recap: recap },
  );

  if (persistError || persisted?.success !== true) {
    await logServerError(
      `Round recap persistence failed: ${persistError?.message ?? 'the database did not confirm the write'}`,
      {
        action: 'generateRoundRecap.persist',
        featureArea: 'round_review_ai',
        roundId,
        playerId: round.player_id,
        userId,
        errorCode: persistError?.code,
        errorHint: persistError?.hint,
        errorDetails: persistError?.details,
      },
      'warning',
    );
    return { recap: null, cached: false };
  }

  // SHOULD-4 (Package 8, 2026-09-23): `persisted.persisted === false` means
  // this call's UPDATE touched zero rows — a concurrent call for the same
  // round already won the single-flight race and its text is what's actually
  // stored. `recap` in that case is THIS call's own (discarded) generation,
  // not the winner's — re-read the stored value instead of returning or
  // caching a recap nobody kept, and skip provenance: the winning call
  // already recorded it. `persisted.persisted` is `undefined` (not `false`)
  // against the pre-migration RPC, so this branch is inert until the owner
  // applies the migration — same safety property the rest of this slice
  // keeps everywhere else.
  if (persisted?.persisted === false) {
    const { data: winner, error: winnerError } = await supabase
      .from('golf_rounds')
      .select('ai_recap')
      .eq('id', roundId)
      .maybeSingle<{ ai_recap: string | null }>();
    if (winnerError) {
      // The winner's recap is durably stored; a failed re-read must not hand
      // back this call's discarded text as if it were the kept one.
      await logServerError(
        `Round recap winner re-read failed: ${winnerError.message}`,
        {
          action: 'generateRoundRecap.rereadWinner',
          featureArea: 'round_review_ai',
          roundId,
          playerId: round.player_id,
          userId,
          errorCode: winnerError.code,
          errorHint: winnerError.hint,
          errorDetails: winnerError.details,
        },
        'warning',
      );
      return { recap: null, cached: false };
    }
    return { recap: winner?.ai_recap ?? recap, cached: true };
  }

  // Package 8 (revision-keyed provenance, 2026-09-23): record which path
  // produced this recap, its golf_coachhelm_llm_calls audit row, whether the
  // typed claim packet was engaged, and the season-stats snapshot it was
  // generated against — best-effort, through the admin client so it never
  // depends on this player/coach's own RLS grants (this table only grants
  // authenticated SELECT, not INSERT). A write failure — including the
  // migration that creates this table not yet being applied in this
  // environment — is logged and swallowed; it must never block or throw the
  // recap itself, which is already durably saved by the RPC above.
  await recordRecapProvenance(roundId, round.player_id, stats, outcome);

  // Gated: never runs on the render path (page.tsx's lazy first-generation
  // call), only when a real action entrypoint explicitly opts in. See the
  // "Render vs. action callers" note in the file header.
  if (options.revalidate) {
    revalidatePath(`/golf/dashboard/rounds/${roundId}`);
  }

  return { recap, cached: false };
}

// --- Single-flight lock (Package 8, migration 20260923100000) ------------
//
// The claim/release/wait mechanics live in the shared
// `@/lib/coachhelm/round-single-flight-lock` module (also used by the
// round-review narrative, kind = 'round_review_narrative') — see that
// module's own header for why it cannot live in this 'use server' file.

/**
 * No "recap revision" concept exists anywhere in this codebase today —
 * checked golf_rounds' own columns and v2 insights' evidenceRevisionKey
 * (lifecycle-policy.ts / upsert.ts), which is a distinct, unrelated
 * maturation-tracking mechanism for a different feature. round-recap.ts
 * always generates once per round (gated by the `ai_recap IS NULL` check
 * above) and has no regenerate flow yet. The lock's primary key carries a
 * revision column anyway, ahead of that need, so a future regenerate flow
 * can take a fresh lock for a new revision without a second schema change —
 * this constant is that placeholder until one exists.
 */
const ROUND_RECAP_LOCK_REVISION = 1;

/**
 * Sized to the documented worst case: one compose() call, one corrective
 * retry (repair plan §14.10's typed-claim retry), and the persistence RPC.
 * No `maxDuration` is configured for the round detail route to tie this to
 * instead — see migration 20260923100000's own comment.
 */
const RECAP_LOCK_TTL_SECONDS = 45;

/**
 * generateRoundRecap runs during Server Component render — a waiter polls
 * for a few seconds, not the full TTL, so a slow render never itself
 * becomes the next request's bottleneck. On exhaustion the waiter tries
 * reclaiming once (covers a holder that crashed mid-wait) before failing
 * closed.
 */
const RECAP_LOCK_WAIT_MS = 6_000;
const RECAP_LOCK_POLL_INTERVAL_MS = 400;

/**
 * Claims the single-flight lock, or waits briefly for a concurrent
 * winner's result, or fails closed. Never calls or triggers an LLM call
 * itself — it only decides whether THIS caller is allowed to. Polls
 * `golf_rounds.ai_recap` specifically — the recap's own storage, never the
 * narrative's `golf_round_reviews.ai_narrative` (a different `kind`'s
 * result must never resolve this caller's wait).
 */
async function acquireRecapLockOrWait(roundId: string, userId: string): Promise<RoundLockOutcome<string>> {
  return acquireRoundLockOrWait<string>({
    roundId,
    revision: ROUND_RECAP_LOCK_REVISION,
    kind: 'recap',
    ttlSeconds: RECAP_LOCK_TTL_SECONDS,
    waitMs: RECAP_LOCK_WAIT_MS,
    pollIntervalMs: RECAP_LOCK_POLL_INTERVAL_MS,
    userId,
    logActionPrefix: 'generateRoundRecap.lock',
    logFeatureArea: 'round_review_ai',
    pollForResult: async () => {
      const admin = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (admin as any)
        .from('golf_rounds')
        .select('ai_recap')
        .eq('id', roundId)
        .maybeSingle();
      if (error) return { value: null, error };
      const aiRecap = (data as { ai_recap: string | null } | null)?.ai_recap;
      return { value: aiRecap ?? null };
    },
  });
}

async function recordRecapProvenance(
  roundId: string,
  playerId: string,
  stats: PlayerStatContext | null,
  outcome: LlmRecapOutcome,
): Promise<void> {
  try {
    const admin = createAdminClient();
    // `golf_round_recap_provenance` is new (this slice's migration) and may
    // not be reflected in the generated Database type in every environment
    // until `npm run db:types` runs against a DB that has it applied — cast,
    // matching this file's existing `(supabase as any).rpc(...)` pattern
    // above for the same reason.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from('golf_round_recap_provenance').insert({
      round_id: roundId,
      player_id: playerId,
      source: outcome.used_llm ? 'llm' : 'deterministic',
      call_log_id: outcome.call_log_id,
      claim_packet_engaged: outcome.claim_packet_engaged,
      stats_rounds_played_at_generation: stats?.rounds_played ?? null,
    });
    if (error) {
      await logServerError(
        `Recap provenance write failed (recap itself was already saved): ${error.message}`,
        {
          action: 'generateRoundRecap.provenance',
          featureArea: 'round_review_ai',
          roundId,
          playerId,
          errorCode: error.code,
          errorHint: error.hint,
          errorDetails: error.details,
          skipSentry: true,
        },
        'warning',
      );
    }
  } catch (err) {
    // Never let a provenance failure (e.g. this migration not yet applied
    // in this environment) surface as a recap failure.
    await logServerError(
      `Recap provenance write threw (recap itself was already saved): ${describeError(err)}`,
      {
        action: 'generateRoundRecap.provenance',
        featureArea: 'round_review_ai',
        roundId,
        playerId,
        skipSentry: true,
      },
      'warning',
    );
  }
}

const observedGenerateRoundRecap = withAdminObserved(
  'generateRoundRecap',
  {
    sport: 'golf',
    feature: 'round_review_ai',
    // The round detail page already knows the round it's rendering — wire
    // that into admin_events on failure instead of relying solely on the
    // authenticated user id (which is null for any unauthenticated/expired
    // session edge case, and never carries which round/player was involved
    // either way).
    contextFrom: ([roundId]) => ({ roundId }),
  },
  generateRoundRecapImpl,
);

export async function generateRoundRecap(
  roundId: string,
  options: GenerateRoundRecapOptions = {},
): Promise<{ recap: string | null; cached: boolean }> {
  return observedGenerateRoundRecap(roundId, options);
}

// --- LLM path -------------------------------------------------------------

/**
 * Package 8 slice 3 (repair plan §14.10, revision-keyed provenance):
 * everything `generateRoundRecapImpl` needs to write a
 * `golf_round_recap_provenance` row after a successful persist, without
 * re-deriving it from `compose()`'s result a second time.
 */
interface LlmRecapOutcome {
  text: string | null;
  used_llm: boolean;
  call_log_id: string | null;
  claim_packet_engaged: boolean;
}

async function generateLLMRecap(
  round: RoundContext,
  stats: PlayerStatContext | null,
  coachId: string | null,
  fallbackText: string,
  playerName: string,
): Promise<LlmRecapOutcome> {
  // Auth is handled by the SDK via Vercel's OIDC token (auto-rotated)
  // inside compose(). compose() also enforces the v3 budget gate, logs
  // the call to golf_coachhelm_llm_calls, and falls back to the
  // deterministic recap on any error or gate denial.

  const stp = round.score_to_par ?? 0;
  const scoreChip = stp === 0 ? 'E' : stp > 0 ? `+${stp}` : `${stp}`;
  const fir =
    round.total_fairways_hit !== null && round.total_fairways !== null
      ? pct(round.total_fairways_hit, round.total_fairways)
      : null;
  const gir =
    round.total_gir !== null && round.total_gir_possible !== null
      ? pct(round.total_gir, round.total_gir_possible)
      : null;

  const facts: string[] = [
    `Player: ${playerName}`,
    `Score: ${round.total_score} (${scoreChip}) over ${round.holes_played ?? 18} holes`,
    `Course: ${round.course_name ?? 'Unknown'}${round.course_city ? ` in ${round.course_city}, ${round.course_state ?? ''}` : ''}`,
    `Round type: ${round.round_type ?? 'practice'}`,
  ];
  if (round.total_putts !== null) facts.push(`Putts: ${round.total_putts}`);
  if (fir !== null) facts.push(`Fairways hit: ${fir}%`);
  if (gir !== null) facts.push(`Greens in regulation: ${gir}%`);
  if (round.front_nine !== null && round.back_nine !== null) {
    facts.push(`Front 9 / Back 9: ${round.front_nine} / ${round.back_nine}`);
  }
  // scoring_average / best_round are 18-hole figures — only offer them as
  // comparison fodder when this round is also 18 holes, otherwise the model
  // writes the same "37 strokes below average" nonsense the deterministic
  // path guards against (and the recap is persisted to golf_rounds.ai_recap).
  if ((round.holes_played ?? 18) === 18) {
    if (stats?.scoring_average) {
      facts.push(`Player's season scoring average: ${stats.scoring_average.toFixed(1)}`);
    }
    if (stats?.best_round) {
      facts.push(`Player's best round of the season: ${stats.best_round}`);
    }
  }

  const prompt = `You are a golf magazine beat reporter writing a two-sentence post-round recap. Voice: editorial, declarative, concrete, no hype, no clichés (avoid "showed up", "performance", "solid round"). Match the calm authority of The New York Times sports desk.

Lead with the one fact that defines this round — best score in a stretch, putt trouble, fairways saving the day, finishing kick, blowup hole, etc. Use the data provided to pick which thread is the lede. The second sentence is forward-looking: a takeaway for the next round, framed as observation not verdict.

Strict rules:
- Exactly two sentences.
- ≤ 36 words total.
- No exclamation points. No emojis. No em-dashes — use periods or commas.
- Refer to the player as "${playerName}" in the third person, or as "you" in the second person. Never the first person, and never any other name.
- Don't restate the score number more than once.
- Reference at least one specific stat by number.

Round data:
${facts.join('\n')}

Output only the two sentences. Nothing else.`;

  // Package 8 slice 2 (repair plan 14.10): the typed claim gate is
  // additive and opt-in. Off by default (coachhelm_recap_claim_packet) —
  // when off, evidence_packet is undefined and compose()'s existing flat
  // numeric scan (evidence: buildRecapEvidence(facts) below) is the only
  // gate, exactly as before this flag existed.
  const evidencePacket = isFlagEnabled('coachhelm_recap_claim_packet')
    ? buildRecapEvidencePacket(round, stats, fir, gir)
    : undefined;

  const result = await compose(
    {
      task: 'round_review',
      coach_id: coachId,
      player_id: round.player_id,
      prompt,
      // The prompt above instructs "Reference at least one specific stat by
      // number", so shipping an empty evidence set guaranteed the discard:
      // `verifyCitations` rejects every token outside 0/1/2/3/100, and
      // compose() threw the whole recap away for the deterministic fallback.
      // Register what the `facts` block already shows the model — not a
      // loosening of the verifier, which still rejects any figure we did not
      // hand over. See `recap-evidence.ts` for the production measurements.
      evidence: buildRecapEvidence(facts),
      evidence_packet: evidencePacket,
      max_completion_tokens: 120, // ~36 words × ~3 tokens/word + buffer
    },
    fallbackText,
  );

  // compose() always returns text — either LLM or the fallback we passed.
  // Run the same sanity check as before so a degenerate LLM reply still
  // collapses to fallback at the persistence layer.
  const trimmed = result.text.trim();
  const claim_packet_engaged = evidencePacket !== undefined;
  if (!trimmed || trimmed.length < 30 || trimmed.length > 400) {
    return { text: null, used_llm: false, call_log_id: result.call_log_id, claim_packet_engaged };
  }
  return { text: trimmed, used_llm: result.used_llm, call_log_id: result.call_log_id, claim_packet_engaged };
}

/**
 * Resolve the coach to bill the LLM spend against. Picks the primary
 * coach of the player's first active team. Returns null when no primary
 * coach exists — compose() then skips the budget gate but still logs.
 */
async function resolveBillingCoachId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
): Promise<string | null> {
  const { data: membership } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (!membership?.team_id) return null;

  const { data: staff } = await supabase
    .from('golf_team_coach_staff')
    .select('coach_id')
    .eq('team_id', membership.team_id)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle();
  return staff?.coach_id ?? null;
}

// --- Deterministic fallback ----------------------------------------------

function buildDeterministicRecap(
  round: RoundContext,
  stats: PlayerStatContext | null,
): string {
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

  // The stats-cache scoring_average and best_round are 18-hole figures, so
  // comparing a 9-hole total against them produces nonsense ("37 strokes
  // below the season average") — and the recap is persisted to
  // golf_rounds.ai_recap. Skip those comparison ledes entirely for short
  // rounds; the score-to-par / putts / fairways / GIR threads stay honest at
  // any hole count.
  const is18HoleRound = (round.holes_played ?? 18) === 18;

  // Pick the lede thread by what's most defining
  let lede: string;
  if (is18HoleRound && stats?.scoring_average && score < stats.scoring_average - 1) {
    const delta = (stats.scoring_average - score).toFixed(1);
    lede = `${score} on the card, ${delta} strokes below the season average.`;
  } else if (is18HoleRound && stats?.best_round && score < stats.best_round) {
    lede = `${score} sets a new low for the season.`;
  } else if (stp < 0) {
    lede = `${score} dipped under par — the kind of round the rest of the season measures itself against.`;
  } else if (round.total_putts !== null && round.holes_played && round.total_putts / round.holes_played > 2) {
    lede = `${score} on the card, but the putter cost ${round.total_putts} strokes on ${round.holes_played} holes.`;
  } else if (fir !== null && fir > 75) {
    lede = `${score} built off the tee — ${fir}% of fairways found.`;
  } else if (gir !== null && gir < 40) {
    lede = `${score}, with the approach game leaking — only ${gir}% of greens.`;
  } else {
    lede = `${score} on the card at ${round.course_name ?? 'the course'}.`;
  }

  // Forward-looking takeaway
  let takeaway: string;
  if (round.total_putts !== null && round.holes_played && round.total_putts / round.holes_played > 2) {
    takeaway = 'Short-game reps before the next outing should pay back what the lag putts gave away.';
  } else if (gir !== null && gir < 50) {
    takeaway = 'Tighter approach proximity is the next thread — the scoring window opens with green-hit rate.';
  } else if (fir !== null && fir < 50) {
    takeaway = 'A more reliable tee shot would compound the gains everywhere else.';
  } else if (stp < 0) {
    takeaway = 'Hold this advantage — the drills supporting it are the ones to keep on the practice plan.';
  } else {
    takeaway = 'The next round is where this baseline gets tested.';
  }

  return `${lede} ${takeaway}`;
}
