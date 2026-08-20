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
import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { describeError } from '@/lib/utils/describe-error';

/**
 * The types a round can be changed to.
 *
 * Deliberately the three that exist in production (tournament 240, practice
 * 124, qualifier 14) rather than every string the codebase has ever written.
 * `'casual'` appears in a handful of source literals but in zero rows, and
 * `stats-data.ts` also tolerates a legacy `'qualifying'` spelling on read —
 * neither is offered here, because an edit control is not the place to mint
 * new vocabulary into a free-text column.
 */
export const EDITABLE_ROUND_TYPES = ['practice', 'tournament', 'qualifier'] as const;
export type EditableRoundType = (typeof EDITABLE_ROUND_TYPES)[number];

export interface UpdateRoundTypeInput {
  roundId: string;
  roundType: EditableRoundType;
  /** Required when changing TO 'qualifier'. Ignored otherwise. */
  qualifierId?: string | null;
  /** Which round of the qualifier this is. Defaults to 1. */
  qualifierRoundNumber?: number | null;
}

export interface UpdateRoundTypeResult {
  success: boolean;
  error?: string;
}

async function updateRoundTypeImpl(
  input: UpdateRoundTypeInput,
): Promise<UpdateRoundTypeResult> {
  const { roundId, roundType } = input;

  if (!EDITABLE_ROUND_TYPES.includes(roundType)) {
    return { success: false, error: 'That is not a round type you can change to.' };
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
      return { success: false, error: 'Round not found.' };
    }

    if (round.round_type === roundType && !input.qualifierId) {
      return { success: true };
    }

    // ── Authorization ──────────────────────────────────────────────────────
    // Either the player whose round it is, or a coach of the team it belongs
    // to. Mirrors the three RLS UPDATE policies, stated in code so a refusal
    // is legible instead of arriving as "0 rows updated".
    const { data: ownPlayer } = await supabase
      .from('golf_players')
      .select('id')
      .eq('id', round.player_id)
      .eq('user_id', user.id)
      .maybeSingle();

    let permitted = Boolean(ownPlayer);

    if (!permitted && round.team_id) {
      const { data: coachRow } = await supabase
        .from('golf_coaches')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (coachRow) {
        const { data: staffRow } = await supabase
          .from('golf_team_coach_staff')
          .select('coach_id')
          .eq('team_id', round.team_id)
          .eq('coach_id', coachRow.id)
          .maybeSingle();
        permitted = Boolean(staffRow);
      }
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

      const { data: qualifier } = await supabase
        .from('golf_qualifiers')
        .select('id, status, num_rounds')
        .eq('id', qualifierId)
        .maybeSingle();

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
      const { data: entry } = await supabase
        .from('golf_qualifier_entries')
        .select('id')
        .eq('qualifier_id', qualifierId)
        .eq('player_id', round.player_id)
        .maybeSingle();

      if (!entry) {
        return { success: false, error: 'This player is not entered in that qualifier.' };
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
      const { data: clash } = await supabase
        .from('golf_rounds')
        .select('id')
        .eq('qualifier_id', qualifierId)
        .eq('player_id', round.player_id)
        .eq('qualifier_round_number', roundNumber)
        .neq('status', 'abandoned')
        .neq('id', roundId)
        .maybeSingle();

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

    const { error: updateError } = await supabase
      .from('golf_rounds')
      .update(update)
      .eq('id', roundId);

    if (updateError) {
      return { success: false, error: describeError(updateError) };
    }

    revalidatePath(`/golf/dashboard/rounds/${roundId}`);
    revalidatePath('/golf/dashboard/rounds');
    revalidatePath('/golf/dashboard/qualifiers');
    revalidatePath('/golf/dashboard/stats');

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
