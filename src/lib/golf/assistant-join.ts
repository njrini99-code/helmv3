import 'server-only';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { describeError } from '@/lib/utils/describe-error';

/**
 * ONE CODE, TWO DESTINATIONS — and no waiting room.
 *
 * A head coach hands out exactly one thing: the team code. Whoever types it at
 * signup picks Player or Assistant coach, and BOTH are attached immediately.
 *
 * WHY THIS IS NOT IN actions/teams.ts
 * -----------------------------------
 * That file is `'use server'`, so every export there is an ACTION BOUNDARY —
 * a function the browser can POST to directly. This function used to live
 * there, exported, taking `userId` as an argument and writing with the service
 * role without reading a session: it was callable without a session, for any
 * user id. The only legitimate caller is `signupActionImpl` in
 * actions/auth.ts, immediately after `auth.signUp` returns, and it passes
 * `data.user.id` from that result. THE USER ID COMES FROM THE SERVER, never
 * from a client argument, and `server-only` keeps this module off the action
 * surface for good (same precedent as `staff-invite-lookup.ts`).
 *
 * WHY THERE IS NO APPROVAL STEP (owner decision, 2026-08-20)
 * ---------------------------------------------------------
 * An earlier version of this recorded a REQUEST and parked the person on a
 * waiting page until a head coach approved it. That was removed on the owner's
 * explicit instruction, stated twice: "they choose and go through the
 * appropriate onboarding, and then boom theyre on the team", and "There
 * shouldn't be an approval. The approval is them having the access code, and
 * putting it in when they hit sign up."
 *
 * The trade-off, written down so it stays a decision and not an accident: the
 * roster code goes to every player, so anyone holding it can now sign up as an
 * assistant coach and read the whole team's rounds and PII. HOLDING THE CODE IS
 * THE AUTHORIZATION. If that ever needs tightening, the fix is a separate
 * assistant-only code — `createStaffInvite` already mints one — and NOT a
 * waiting room, because the waiting room is what made this feel broken.
 *
 * IT NEVER REPOINTS AN EXISTING ACCOUNT.
 * A brand-new signup has no golf_coaches or golf_players row
 * (`handle_new_user` only writes public.users), so the checks below never fire
 * on the real path. They exist so this function cannot turn a player into
 * staff, move another program's coach into this one, or demote a head coach:
 * an account already bound to a different organization is refused with nothing
 * written, and existing staff rows are left as they are.
 *
 * FULL ACCESS MEANS EVERY TEAM IN THE PROGRAM.
 * `golf_team_coach_staff` is per-TEAM and a program can carry several:
 * Shenandoah runs a men's and a women's team and its head coach is staffed on
 * both. An assistant staffed only on the team whose code they happened to be
 * handed would silently see half the program — so a row is written for every
 * team in the organization. That is what the access helpers read:
 *
 *   is_golf_team_coach(t) = EXISTS(golf_team_coach_staff WHERE team = t ...)
 *
 * Neither that helper nor `is_golf_team_head_coach` reads
 * `golf_coaches.organization_id`, and every coach-side RLS policy routes
 * through one of them. The staff rows ARE the access; nothing else grants it.
 */
async function joinTeamAsAssistantCoachImpl(
  userId: string,
  teamJoinCode: string,
  fullName: string | undefined,
  email: string,
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient();

  // The join code is the ONLY thing that decides which program is joined. It
  // came from the server-side gate cookie, never from the form.
  const { data: team, error: teamError } = await admin
    .from('golf_teams')
    .select('id, name, organization_id')
    .eq('join_code', teamJoinCode.toUpperCase())
    .maybeSingle();

  if (teamError || !team?.organization_id) {
    await logServerError(
      `[joinTeamAsAssistantCoach] team lookup failed: ${describeError(teamError)}`,
      { action: 'teams.joinTeamAsAssistantCoach', featureArea: 'teams' },
      'warning',
    );
    return { success: false, error: 'We could not find the team for that code.' };
  }

  // A PLAYER must not become staff through this path, and a coach already
  // bound to ANOTHER program must not be repointed by an upsert on user_id.
  // A failed read is refused too: "unknown" is not "no existing account".
  const [{ data: existingPlayer, error: playerError }, { data: existingCoach, error: existingCoachError }] =
    await Promise.all([
      admin.from('golf_players').select('id').eq('user_id', userId).maybeSingle(),
      admin.from('golf_coaches').select('id, organization_id').eq('user_id', userId).maybeSingle(),
    ]);

  if (playerError || existingCoachError) {
    await logServerError(
      `[joinTeamAsAssistantCoach] existing-account check failed: ${describeError(playerError ?? existingCoachError)}`,
      { action: 'teams.joinTeamAsAssistantCoach', featureArea: 'teams' },
      'error',
    );
    return { success: false, error: 'We could not finish setting up your account.' };
  }

  if (existingPlayer) {
    await logServerError(
      '[joinTeamAsAssistantCoach] refused: account already has a player profile',
      { action: 'teams.joinTeamAsAssistantCoach', featureArea: 'teams' },
      'warning',
    );
    return {
      success: false,
      error: 'This account is already a player account, so it cannot join as an assistant coach.',
    };
  }

  if (existingCoach?.organization_id && existingCoach.organization_id !== team.organization_id) {
    await logServerError(
      '[joinTeamAsAssistantCoach] refused: coach already belongs to a different organization',
      { action: 'teams.joinTeamAsAssistantCoach', featureArea: 'teams' },
      'warning',
    );
    return {
      success: false,
      error: 'This account already coaches another program, so it cannot join this one with a team code.',
    };
  }

  // `onboarding_completed: true` — they are DONE. The wizard at '/golf/coach'
  // is new-program onboarding: it inserts a fresh organization and team and
  // re-points organization_id at them. Running it for this account is what
  // produced the "An organization named X already exists" dead end an assistant
  // hit on 2026-08-19, and, when the name did not collide, a phantom duplicate
  // program. The flag keeps every routing entry point away from that form.
  const { data: coachRow, error: coachError } = await admin
    .from('golf_coaches')
    .upsert(
      {
        user_id: userId,
        organization_id: team.organization_id,
        full_name: fullName ?? null,
        email,
        onboarding_completed: true,
      },
      { onConflict: 'user_id' },
    )
    .select('id')
    .maybeSingle();

  if (coachError || !coachRow) {
    await logServerError(
      `[joinTeamAsAssistantCoach] coach upsert failed: ${describeError(coachError)}`,
      { action: 'teams.joinTeamAsAssistantCoach', featureArea: 'teams' },
      'error',
    );
    return { success: false, error: 'We could not finish setting up your account.' };
  }

  // EVERY team in the program, not just the one whose code was typed.
  const { data: programTeams, error: teamsError } = await admin
    .from('golf_teams')
    .select('id')
    .eq('organization_id', team.organization_id);

  if (teamsError) {
    // Not fatal: fall back to the team the code names, so the assistant still
    // gets in. Logged because on a multi-team program this is the difference
    // between full access and half of it.
    await logServerError(
      `[joinTeamAsAssistantCoach] program team list failed; granting access to the code's team only: ${describeError(teamsError)}`,
      { action: 'teams.joinTeamAsAssistantCoach', featureArea: 'teams' },
      'warning',
    );
  }

  const teamIds = Array.from(
    new Set([team.id, ...((programTeams ?? []).map((t) => t.id))]),
  );

  // ALWAYS 'assistant_coach'. This path cannot mint a head coach — that stays
  // with createStaffInvite's admin role, which requires deliberately choosing
  // "Program admin".
  //
  // Upsert on (team_id, coach_id) with ignoreDuplicates so a repeat signup or a
  // re-run is idempotent rather than a duplicate-key failure, and an existing
  // staff row (a same-org head coach, say) keeps its role instead of being
  // rewritten to assistant.
  const { error: staffError } = await admin
    .from('golf_team_coach_staff')
    .upsert(
      teamIds.map((id) => ({
        team_id: id,
        coach_id: coachRow.id,
        role: 'assistant_coach' as const,
        is_primary: false,
      })),
      { onConflict: 'team_id,coach_id', ignoreDuplicates: true },
    );

  if (staffError) {
    // These rows ARE the access. Unlike the notification below, this failure
    // must be reported: staying silent would hand somebody an account that can
    // sign in and see nothing, which is precisely the old broken experience.
    await logServerError(
      `[joinTeamAsAssistantCoach] staff insert failed for coach ${coachRow.id}: ${describeError(staffError)}`,
      { action: 'teams.joinTeamAsAssistantCoach', featureArea: 'teams' },
      'error',
    );
    return {
      success: false,
      error: 'We created your account but could not add you to the team. Please try signing in again.',
    };
  }

  // Tell the head coach somebody joined. INFORMATIONAL — there is nothing to
  // approve any more — so it is fire-and-forget and never fails the signup.
  // ADMIN client because this is a cross-user write: `notifications_insert_own`
  // is WITH CHECK (user_id = auth.uid()) and would refuse a row addressed to
  // somebody else.
  try {
    const { data: heads, error: headsError } = await admin
      .from('golf_team_coach_staff')
      .select('coach_id, golf_coaches!inner(user_id)')
      .eq('team_id', team.id)
      .eq('role', 'head_coach');

    // Best-effort notification — a failed read is "recipients unknown", not
    // "no recipients"; skip rather than silently notify nobody.
    const recipients = (headsError ? [] : heads ?? [])
      .map((row) => (row as unknown as { golf_coaches?: { user_id?: string | null } }).golf_coaches?.user_id)
      .filter((id): id is string => Boolean(id) && id !== userId);

    if (recipients.length > 0) {
      const joinerName = fullName?.trim() || email;
      // `team_join` — a REAL member of the notification_type enum. That enum
      // has 11 values (checked against production 2026-08-20) and none of them
      // is assistant-shaped; `fromUntyped` bypasses the generated types at
      // exactly this call, so an invented label compiles, fails at runtime with
      // 22P02, and vanishes into the catch below. The copy carries the meaning.
      await fromUntyped(admin, 'notifications').insert(
        recipients.map((recipientId) => ({
          user_id: recipientId,
          type: 'team_join' as const,
          title: 'Assistant coach joined',
          body: `${joinerName} joined ${team.name ?? 'your team'} as an assistant coach.`,
          action_url: '/golf/dashboard/team',
          data: {
            team_id: team.id,
            team_name: team.name,
            joiner_email: email,
            joiner_name: joinerName,
          },
          read: false,
        })),
      );
    }
  } catch (error) {
    await logServerError(
      `[joinTeamAsAssistantCoach] notification step threw; the coach is on the team regardless: ${describeError(error)}`,
      { action: 'teams.joinTeamAsAssistantCoach', featureArea: 'teams' },
      'warning',
    );
  }

  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/team');
  return { success: true };
}

/**
 * Attach a NEW assistant coach to the program named by `teamJoinCode`, with
 * full access, immediately. No approval step — see the docblock above.
 *
 * `userId` MUST be the id `auth.signUp` just returned on the server. Never
 * pass an id that came from the browser.
 */
export const joinTeamAsAssistantCoach = withAdminObserved(
  'joinTeamAsAssistantCoach',
  { sport: 'golf', feature: 'join_team_flow', demoSafe: true },
  joinTeamAsAssistantCoachImpl,
);
