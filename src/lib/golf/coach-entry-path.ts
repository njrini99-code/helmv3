import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

/**
 * Where a signed-in GOLF COACH ACCOUNT belongs right now.
 *
 * WHY THIS IS ONE FUNCTION AND NOT FIVE COPIES
 * --------------------------------------------
 * Five separate places decide this — `loginAction`, the coach onboarding
 * page's own auth check, `/golf/join/[code]`, the OAuth callback, and the
 * dashboard layout. Every one of them asked the same question the same wrong
 * way:
 *
 *     if (!coach.onboarding_completed) -> '/golf/coach'
 *
 * `/golf/coach` is NEW-PROGRAM onboarding: the school-details wizard that
 * creates a fresh `organizations` row, a fresh `golf_teams` row, and makes the
 * signer its head coach. Sending the wrong account there does not merely show
 * the wrong screen — completing it OVERWRITES `golf_coaches.organization_id`,
 * which is the entire link between a person and their program. That is the
 * phantom-duplicate-program bug reported by UNCW (2026-08-18) and Shenandoah
 * (2026-08-19).
 *
 * Two account shapes carry `onboarding_completed = false` and must never see
 * that wizard:
 *
 *   1. A PENDING assistant. `createPendingAssistantCoach` writes the flag false
 *      deliberately — the waiting screen is their onboarding.
 *   2. An APPROVED assistant. Until this change `approvePendingAssistantCoach`
 *      inserted the staff row and left the flag alone, so approval did not
 *      clear the condition. An assistant the head coach had just approved was
 *      bounced into new-program onboarding on their very next login, and
 *      finishing it detached them from the program that had just accepted
 *      them. Approval made things worse, silently.
 *
 * THE DISCRIMINATOR
 * -----------------
 * `golf_team_coach_staff` — checked BEFORE the flag, because it is the same
 * table the access helpers read (`is_golf_team_coach` and
 * `is_golf_team_head_coach` are both `EXISTS()` over it and read nothing else).
 * "Has a row" and "can see team data" therefore cannot drift apart, and a stale
 * `onboarding_completed` cannot strand somebody who genuinely has access.
 *
 * The flag is still consulted, but only for the one case where it carries
 * information the staff row cannot: an account with a program and no staff row
 * is a pending assistant when the flag is false, and a head coach whose team
 * creation did not finish when it is true. The second one does belong back in
 * the wizard — its upsert is idempotent and completes the job.
 */
export type GolfCoachEntry = {
  /** Where to send them. */
  path: '/golf/dashboard' | '/golf/coach/pending' | '/golf/coach';
  /** Why — for logging and for tests that must pin the reasoning, not just the URL. */
  reason:
    | 'no-coach-profile'
    | 'staffed'
    | 'pending-assistant'
    | 'unattached'
    | 'incomplete-head-coach'
    | 'lookup-failed';
};

const NEW_PROGRAM: GolfCoachEntry = { path: '/golf/coach', reason: 'no-coach-profile' };

/**
 * Resolve a coach account's entry path from its own rows.
 *
 * Uses the ADMIN client on purpose. This is a routing decision, not a data
 * grant — nothing it reads is returned to the caller — and it must not be able
 * to fail closed into "pending" merely because RLS declined to show an approved
 * assistant their own staff row. `/golf/coach/pending` already reads the same
 * table the same way for the same reason.
 *
 * Never throws. A failed read routes to the waiting page, which is the safe
 * direction for the ambiguity: it self-clears the moment the row is readable,
 * whereas guessing `/golf/coach` offers new-program onboarding to somebody who
 * may already have a program — the exact hazard this file exists to prevent.
 */
export async function resolveGolfCoachEntry(userId: string): Promise<GolfCoachEntry> {
  try {
    const admin = createAdminClient();

    const { data: coach, error: coachError } = await admin
      .from('golf_coaches')
      .select('id, organization_id, onboarding_completed')
      .eq('user_id', userId)
      .maybeSingle();

    if (coachError) {
      await logServerError(
        `[resolveGolfCoachEntry] coach read failed for user ${userId}; routing to the waiting page rather than risk offering new-program onboarding to an existing coach: ${describeError(coachError)}`,
        { action: 'golf.resolveGolfCoachEntry', featureArea: 'auth' },
        'error',
      );
      return { path: '/golf/coach/pending', reason: 'lookup-failed' };
    }

    // No coach row at all is the ONLY legitimate entrant to new-program
    // onboarding. `completeCoachOnboarding` is the sole writer of this table for
    // a head coach, so its absence means nobody has set this person up yet.
    if (!coach) return NEW_PROGRAM;

    // Declined assistants are detached rather than deleted
    // (`declinePendingAssistantCoach` nulls organization_id), so they hold a
    // coach row with no program. The wizard is genuinely right for them.
    if (!coach.organization_id) {
      return { path: '/golf/coach', reason: 'unattached' };
    }

    const { data: staffRow, error: staffError } = await admin
      .from('golf_team_coach_staff')
      .select('id')
      .eq('coach_id', coach.id)
      .limit(1)
      .maybeSingle();

    if (staffError) {
      await logServerError(
        `[resolveGolfCoachEntry] staff read failed for coach ${coach.id}; an approved coach may be routed to the waiting page: ${describeError(staffError)}`,
        { action: 'golf.resolveGolfCoachEntry', featureArea: 'teams' },
        'error',
      );
      return { path: '/golf/coach/pending', reason: 'lookup-failed' };
    }

    // The staff row IS team access. Checked before the flag so a stale
    // `onboarding_completed` can never strand somebody who has been approved.
    if (staffRow) return { path: '/golf/dashboard', reason: 'staffed' };

    // Program, but no access yet: waiting on the head coach.
    if (!coach.onboarding_completed) {
      return { path: '/golf/coach/pending', reason: 'pending-assistant' };
    }

    // Program, no access, and marked onboarded — a head coach whose team or
    // staff row did not get created. The wizard's upsert is idempotent, so
    // sending them back finishes the job rather than duplicating it.
    return { path: '/golf/coach', reason: 'incomplete-head-coach' };
  } catch (error) {
    await logServerError(
      `[resolveGolfCoachEntry] unexpected failure for user ${userId}: ${describeError(error)}`,
      { action: 'golf.resolveGolfCoachEntry', featureArea: 'auth' },
      'error',
    ).catch(() => {});
    return { path: '/golf/coach/pending', reason: 'lookup-failed' };
  }
}
