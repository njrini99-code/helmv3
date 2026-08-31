'use server';

/**
 * Change the type of an already-submitted round.
 *
 * WHY THIS EXISTS
 * ---------------
 * Reported by a coach 2026-08-19: "UNCW boys accidentally clicked practice
 * instead of qualifier and they just need to go in and change their type of
 * round." Until now nothing could do that — `round_type` was written exactly
 * once, at draft creation (`round-drafts.ts`), and there were **zero**
 * update paths touching it anywhere in `src/`. Not for the player, not for
 * the coach, not for an admin. A mis-tap at setup was permanent, and the
 * round stayed out of the qualifier's results forever.
 *
 * THE PART THAT IS NOT A ONE-COLUMN UPDATE
 * ----------------------------------------
 * A round shows up in a qualifier because of `qualifier_id`, NOT because of
 * `round_type`. They are separate columns and both must agree:
 *
 *   round_type = 'qualifier'   -> makes it COUNT as a qualifying round
 *   qualifier_id = <uuid>      -> decides WHICH qualifier it belongs to
 *
 * Setting only the first would produce a round that calls itself a qualifier,
 * passes every type check, appears correctly labelled in the UI — and still
 * never appears in the qualifier's results, because nothing joins it to one.
 * That is precisely the failure `round-drafts.ts:167` documents from #916,
 * where the draft-save path dropped `qualifier_id` "even when round_type
 * correctly said 'qualifier'".
 *
 * Production currently holds that invariant perfectly: all 14 qualifier-typed
 * rounds have a `qualifier_id`, 0 without. A naive edit action would have been
 * the first thing to break it, and the breakage would have been invisible —
 * the coach would see "qualifier" on screen and still not see the round in the
 * standings.
 *
 * So converting TO a qualifier requires the same four checks the original
 * submit path enforces (`golf.ts` ~1360-1400), reproduced here rather than
 * skipped: qualifier exists and is not completed, the player is actually
 * entered in it, the round number is within `num_rounds`, and that round
 * number is not already taken. Converting AWAY from a qualifier clears the
 * linkage instead of orphaning it.
 *
 * WHAT DOES NOT NEED DOING
 * ------------------------
 * Qualifier standings are not a precomputed table — `stats-data.ts:275`
 * filters `round_type in ('qualifier','qualifying')` at query time. So the
 * change is reflected the moment it lands; there is no standings rebuild to
 * trigger and no cache keyed on round type to invalidate.
 *
 * AUTHORIZATION
 * -------------
 * `getUser()` first, before any DB read (repo rule; the Review Gate blocks
 * server actions that skip it). Then an explicit ownership check in code —
 * the three RLS UPDATE policies on `golf_rounds` already permit exactly the
 * right people (owning player, team coach, staff coach), but RLS is the floor,
 * not the argument: a caller who is not permitted should get a clear error
 * rather than a silent zero-row update.
 */

import { revalidatePath } from 'next/cache';

import { updateQualifierEntryStats } from '@/lib/golf/qualifier-standings';
import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { describeError } from '@/lib/utils/describe-error';
import { logServerError } from '@/lib/server-error-logger';
// NOT declared here: this file is `'use server'`, and such a module may export
// only async functions — every export becomes a server-action endpoint. A bare
// `export const` is a build error. See lib/golf/round-type-options.ts.
import {
  EDITABLE_ROUND_TYPES,
  type EditableRoundType,
  type UpdateRoundTypeInput,
  type UpdateRoundTypeResult,
} from '@/lib/golf/round-type-options';


async function updateRoundTypeImpl(
  input: UpdateRoundTypeInput,
): Promise<UpdateRoundTypeResult> {
  const { roundId, roundType } = input;

  if (!EDITABLE_ROUND_TYPES.includes(roundType)) {
    return { success: false, error: "That isn't a round type you can change to." };
  }

  try {
    const supabase = await createClient();

    // Auth before any data access. Not negotiable here.
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'You need to be signed in to change a round.' };
    }

    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('id, player_id, team_id, round_type, status, qualifier_id, qualifier_round_number')
      .eq('id', roundId)
      .maybeSingle();

    if (roundError) {
      return { success: false, error: describeError(roundError) };
    }
    if (!round) {
      // Covers both "no such round" and "RLS hid it" — deliberately the same
      // message, so this can't be used to probe which rounds exist.
      return { success: false, error: 'That round could not be found.' };
    }

    if (round.round_type === roundType && !input.qualifierId) {
      return { success: true };
    }

    // ── Authorization ──────────────────────────────────────────────────────
    // Either the player whose round it is, or a coach of the team it belongs
    // to. Mirrors the three RLS UPDATE policies, stated in code so a refusal
    // is legible instead of arriving as "0 rows updated".
    const { data: ownPlayer, error: ownPlayerError } = await supabase
      .from('golf_players')
      .select('id')
      .eq('id', round.player_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (ownPlayerError) {
      return { success: false, error: 'Could not verify your access to this round. Please try again.' };
    }

    // Coach-of-this-team is needed twice: for permission, and again to decide
    // whether a MISSING qualifier entry can be created rather than refused.
    // Resolved at most once, and independently of `ownPlayer` — a coach who is
    // also the player on the round is still a coach.
    let teamCoachResolved = false;
    let isTeamCoach = false;
    const resolveTeamCoach = async (): Promise<string | null> => {
      if (teamCoachResolved || !round.team_id) return null;
      teamCoachResolved = true;

      const { data: coachRow, error: coachRowError } = await supabase
        .from('golf_coaches')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (coachRowError) {
        return 'Could not verify your access to this round. Please try again.';
      }
      if (!coachRow) return null;

      const { data: staffRow, error: staffRowError } = await supabase
        .from('golf_team_coach_staff')
        .select('coach_id')
        .eq('team_id', round.team_id)
        .eq('coach_id', coachRow.id)
        .maybeSingle();
      if (staffRowError) {
        return 'Could not verify your access to this round. Please try again.';
      }
      isTeamCoach = Boolean(staffRow);
      return null;
    };

    let permitted = Boolean(ownPlayer);

    if (!permitted) {
      const failure = await resolveTeamCoach();
      if (failure) return { success: false, error: failure };
      permitted = isTeamCoach;
    }

    if (!permitted) {
      return { success: false, error: 'You do not have permission to change this round.' };
    }

    // ── The qualifier linkage, which is the whole reason this isn't one line ─
    // Typed rather than Record<string, unknown>: the generated row type is what
    // catches a column that has been renamed or dropped out from under this,
    // and an untyped bag opts out of exactly that check.
    const update: {
      round_type: EditableRoundType;
      qualifier_id?: string | null;
      qualifier_round_number?: number | null;
    } = { round_type: roundType };

    if (roundType === 'qualifier') {
      const qualifierId = input.qualifierId ?? round.qualifier_id;
      if (!qualifierId) {
        return {
          success: false,
          error: 'Pick which qualifier this round belongs to — a qualifier round has to be attached to one to appear in its results.',
        };
      }

      const { data: qualifier, error: qualifierError } = await supabase
        .from('golf_qualifiers')
        .select('id, status, num_rounds')
        .eq('id', qualifierId)
        .maybeSingle();

      // A failed read must not present as "no longer exists" — that message
      // tells the coach to give up on a qualifier that may be fine.
      if (qualifierError) {
        return { success: false, error: 'Could not look up that qualifier. Please try again.' };
      }
      if (!qualifier) {
        return { success: false, error: 'That qualifier no longer exists.' };
      }
      if (qualifier.status === 'completed') {
        return {
          success: false,
          error: 'That qualifier is already completed, so rounds can no longer be added to it.',
        };
      }

      // The player must actually be entered — same check the submit path runs.
      const { data: entry, error: entryError } = await supabase
        .from('golf_qualifier_entries')
        .select('id')
        .eq('qualifier_id', qualifierId)
        .eq('player_id', round.player_id)
        .maybeSingle();

      if (entryError) {
        return { success: false, error: 'Could not check the qualifier entries. Please try again.' };
      }

      // A missing entry used to end here. That refusal is the dead end behind
      // the 2026-08-31 report: turning a practice round into a qualifier round
      // is PRECISELY the case where no entry exists yet, so the one thing a
      // coach wanted to do was the one thing the check forbade — and the
      // message named the coach as the person who must fix it while the coach
      // was the one reading it.
      //
      // The entry is not optional bookkeeping: `get_qualifier_leaderboard`
      // reads FROM golf_qualifier_entries and LEFT JOINs the rounds, so a
      // round attached without one is filed where the player appears nowhere.
      // Creating it is what makes the reclassification mean anything.
      //
      // RLS INSERT on entries is coach-only, so this splits by role rather
      // than pretending both can: a coach enters the player, a player is told
      // who can.
      if (!entry) {
        const failure = await resolveTeamCoach();
        if (failure) return { success: false, error: failure };

        if (!isTeamCoach) {
          return {
            success: false,
            error:
              'You are not in that qualifier yet. Ask your coach to add you to it, then change this round.',
          };
        }

        const { error: enterError } = await supabase
          .from('golf_qualifier_entries')
          .upsert(
            { qualifier_id: qualifierId, player_id: round.player_id },
            { onConflict: 'qualifier_id,player_id', ignoreDuplicates: true },
          );
        if (enterError) {
          return {
            success: false,
            error: 'Could not add this player to that qualifier. Please try again.',
          };
        }
      }

      const roundNumber = input.qualifierRoundNumber ?? round.qualifier_round_number ?? 1;
      const numRounds = qualifier.num_rounds ?? 1;
      if (roundNumber > numRounds) {
        return {
          success: false,
          error: `That qualifier only has ${numRounds} round${numRounds === 1 ? '' : 's'}. Round ${roundNumber} is beyond it.`,
        };
      }

      // Don't let two rounds claim the same slot.
      const { data: clash, error: clashError } = await supabase
        .from('golf_rounds')
        .select('id')
        .eq('qualifier_id', qualifierId)
        .eq('player_id', round.player_id)
        .eq('qualifier_round_number', roundNumber)
        .neq('status', 'abandoned')
        .neq('id', roundId)
        .maybeSingle();

      // Unchecked, this guard FAILED OPEN: a read error looked like "no
      // clash" and let two rounds claim the same qualifier slot.
      if (clashError) {
        return { success: false, error: 'Could not verify the qualifier slot is free. Please try again.' };
      }
      if (clash) {
        return {
          success: false,
          error: `Round ${roundNumber} of that qualifier is already taken by another round.`,
        };
      }

      update.qualifier_id = qualifierId;
      update.qualifier_round_number = roundNumber;
    } else if (round.qualifier_id) {
      // Leaving the qualifier: drop the linkage rather than leaving a
      // practice round still pointing at a qualifier it no longer counts for.
      update.qualifier_id = null;
      update.qualifier_round_number = null;
    }

    // A round cannot be re-typed by a direct table UPDATE: `golf_rounds`
    // carries a BEFORE-UPDATE lifecycle guard that refuses it with SQLSTATE
    // 55000. That guard is right about scores and was twice over-broad about
    // classification — re-typing a round changes what it COUNTS TOWARD, not a
    // single stroke of it. On 2026-08-23 it stranded four Guilford players who
    // had recorded qualifier rounds as practice rounds (fixed for COMPLETED
    // rounds by 20260824030000), and it went on refusing rounds that were
    // merely unfinished until 20260830120000 — which is the "players still
    // cannot edit round type after the round" report of 2026-08-30.
    //
    // `reclassify_golf_round` is the narrow, marker-gated RPC that owns this
    // write (migration 20260824030000). It re-checks permission itself
    // (round owner or team coach) because SECURITY DEFINER bypasses RLS, and
    // the guard still refuses the write if ANY column other than round_type /
    // qualifier_id / qualifier_round_number differs.
    //
    // The narrow cast is because `src/lib/types/database.ts` is generated and
    // does not know this function yet. Regenerate the types and this collapses
    // to a plain `supabase.rpc('reclassify_golf_round', ...)`. Deliberately a
    // precise signature rather than `any`, so a rename or an argument change
    // still fails the build.
    type ReclassifyRpc = (
      fn: 'reclassify_golf_round',
      args: {
        p_round_id: string;
        p_round_type: EditableRoundType;
        p_qualifier_id: string | null;
        p_qualifier_round_number: number | null;
      },
    ) => Promise<{
      data: string | null;
      error: { code?: string; message: string; hint?: string; details?: string } | null;
    }>;

    const callReclassify = supabase.rpc as unknown as ReclassifyRpc;

    const { data: reclassifiedId, error: updateError } = await callReclassify(
      'reclassify_golf_round',
      {
        p_round_id: roundId,
        p_round_type: roundType,
        p_qualifier_id: update.qualifier_id ?? null,
        p_qualifier_round_number: update.qualifier_round_number ?? null,
      },
    );

    // A null id means the round vanished between the read above and the write.
    if (!updateError && !reclassifiedId) {
      return { success: false, error: 'That round no longer exists.' };
    }

    if (updateError) {
      // `golf_rounds` carries a BEFORE-UPDATE lifecycle guard
      // (helm_private.guard_golf_round_lifecycle) that rejects ANY update to a
      // completed round with SQLSTATE 55000. Reclassifying a round changes
      // what it counts toward, not a single stroke of it, so the guard is
      // over-broad here — but until it grows a narrow exception, the coach at
      // least gets a sentence they can act on instead of the raw
      // "code=55000 msg=Completed rounds are permanent history and cannot be
      // changed." that was being rendered verbatim in the round editor.
      // The RPC now enforces every rule this action checks above, so these
      // mostly fire when the world changed between our reads and the write.
      // Each maps to the reason, never to a SQLSTATE — a coach reading
      // "code=55000" learns nothing they can act on.
      if (updateError.code === '42501') {
        // Not owner/coach, not entered in that qualifier, or the qualifier
        // belongs to another team. The action's own checks above produce the
        // specific sentence; this is the fallback when the RPC got there first.
        return { success: false, error: "You don't have permission to change this round." };
      }
      if (updateError.code === '22023') {
        return { success: false, error: 'Pick which qualifier and round number this counts as.' };
      }
      if (updateError.code === '23505') {
        return {
          success: false,
          error: 'That qualifier round number was just taken by another round. Pick a different one.',
        };
      }
      if (updateError.code === '55000') {
        // The lifecycle guard refused. Since 20260830120000 the `reclassify`
        // branch covers live rounds as well as submitted ones, so this should
        // only be reachable if the round changed status underneath us — which
        // is a stale-page problem, not a permanence problem.
        //
        // The previous copy here said the round's "scores are locked as
        // submitted history". That was wrong in the case operators actually
        // hit: an `in_progress` round was refused by the guard's general
        // branch, and the player was told their round was permanent history
        // when it had never been submitted at all.
        return {
          success: false,
          error:
            "This round changed while you were editing it, so the new type wasn't saved. Reload the round and try again — the scores themselves are safe and unchanged.",
        };
      }
      // Never surface a raw driver string to a coach. describeError() is for
      // logs; the UI gets copy written for a person.
      void logServerError(`updateRoundType failed: ${describeError(updateError)}`, {
        action: 'updateRoundType',
        featureArea: 'round_tracking',
        roundId,
        errorCode: updateError.code,
      }, 'error');
      return {
        success: false,
        error: "Couldn't change this round's type. Please try again.",
      };
    }

    // Re-derive the standings for every qualifier this round just entered or
    // left. `get_qualifier_leaderboard` recomputes live from golf_rounds, so
    // the coach's leaderboard is already correct — but golf_qualifier_entries
    // ALSO carries stored totals (score, total_score, total_to_par,
    // rounds_completed) and `getPlayerQualifiers` renders the player's own
    // card from those. Submitting a round was previously the only thing that
    // refreshed them, which was correct while a round's qualifier identity was
    // fixed at creation. Now that a round can MOVE, the totals on both sides
    // of the move go stale, and the player's card would disagree with their
    // coach's leaderboard.
    //
    // Best-effort on purpose: the round type is already saved, and failing the
    // whole action over a secondary aggregate would be the worse trade. Same
    // helper the submit path uses, so both routes converge on one definition.
    const affectedQualifiers = Array.from(
      new Set([update.qualifier_id ?? null, round.qualifier_id ?? null].filter(Boolean) as string[]),
    );
    for (const qid of affectedQualifiers) {
      try {
        await updateQualifierEntryStats(qid, round.player_id);
      } catch (err) {
        void logServerError(
          `updateRoundType: standings refresh failed for qualifier ${qid}; the round type IS saved and the coach leaderboard recomputes live, but the player's stored totals are now stale: ${describeError(err)}`,
          { action: 'updateRoundType.standings', featureArea: 'round_tracking', roundId },
          'warning',
        );
      }
    }

    revalidatePath(`/golf/dashboard/rounds/${roundId}`);
    revalidatePath('/golf/dashboard/rounds');
    revalidatePath('/golf/dashboard/qualifiers');
    revalidatePath('/golf/dashboard/stats');
    revalidatePath('/golf/dashboard/my-qualifiers');

    return { success: true };
  } catch (err) {
    return { success: false, error: describeError(err) };
  }
}

/**
 * Wrapped for Helm Bridge, like every other golf server action — enforced by
 * `__tests__/coverage-contract.observability.test.ts`.
 *
 * `demoSafe: true` because this MUTATES: it rewrites what a round counts
 * toward, including its qualifier linkage. The shared demo account must not be
 * able to move rounds in and out of a real program's standings.
 *
 * `observeSoftFailures: false` — every `{ success: false }` this action returns
 * is a deliberate, explained refusal (not entered in that qualifier, slot
 * already taken, no permission). Those are the action working, not incidents.
 * Thrown exceptions are still recorded by the wrapper.
 */
const observedUpdateRoundType = withAdminObserved(
  'updateRoundType',
  {
    demoSafe: true,
    sport: 'golf',
    feature: 'round_tracking',
    observeSoftFailures: false,
    contextFrom: ([input]) => ({ roundId: input?.roundId }),
  },
  updateRoundTypeImpl,
);

export async function updateRoundType(
  input: UpdateRoundTypeInput,
): Promise<UpdateRoundTypeResult> {
  return observedUpdateRoundType(input);
}
