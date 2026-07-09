import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';

// =============================================================================
// SECURITY / CORRECTNESS (Production-Readiness Mission W0a):
//
// This route used to attempt `DELETE FROM users` directly after a handful of
// unrelated cleanup deletes, then rely on `baseball_coaches.user_id` /
// `golf_coaches.user_id` ON DELETE CASCADE to remove the coach profile. That
// CASCADE only succeeds if every row referencing the coach's OWN id (or the
// user's id directly) has an ON DELETE behavior of CASCADE or SET NULL. A
// live-schema check (information_schema.referential_constraints) found a set
// of "who did this" attribution columns with ON DELETE NO ACTION instead —
// the DEFAULT Postgres behavior most other equivalent columns in this schema
// override to SET NULL, but these did not:
//
//   baseball_games.created_by                    -> baseball_coaches.id
//   baseball_practice_blocks.coach_owner_id       -> baseball_coaches.id
//   golf_academic_exclusions.excluded_by          -> golf_coaches.id
//   golf_announcements.created_by                 -> golf_coaches.id
//   golf_goals.coach_id_if_assigned               -> golf_coaches.id
//   golf_travel_itineraries.created_by            -> golf_coaches.id
//   crm_coaches.archived_by / created_by          -> users.id
//   crm_contact_log.created_by                    -> users.id
//   crm_email_templates.created_by                -> users.id
//   crm_events.created_by                         -> users.id
//   golf_task_templates.created_by                -> users.id
//   golf_team_coachhelm_settings.disabled_by      -> users.id
//
// Any coach who has ever created a game, a practice block, an academic
// exclusion, an announcement, an assigned goal, a travel itinerary, or (for
// admin/CRM users) touched the CRM tables above would hit a hard Postgres FK
// violation on the `users` delete, rolling the whole statement back — this
// was the "RESTRICT FK failure for most active coach/admin accounts."
//
// Fix: reassign (NULL out) every one of those attribution columns for this
// user's coach/user id BEFORE the final `users` delete, so the CASCADE it
// triggers never hits a blocking reference. This is non-destructive — it
// only detaches the "who did this" stamp, never removes the underlying
// content (the game, the announcement, the exclusion, etc. all stay intact
// for the team). `baseball_team_invitations` rows this coach created are
// DELETED outright rather than reassigned — an invitation/join-code row is
// operational metadata (not team-shared content; redeemed invitations don't
// affect the resulting `baseball_team_members` rows, which have no FK to
// `baseball_team_invitations`), so removing the coach's own invite codes on
// deletion is safe and non-destructive to anyone else's data.
//
// RESIDUAL GAP (documented, not silently swallowed): a SMALL number of
// similar attribution columns are NOT NULL, so they cannot be reassigned to
// NULL, and the rows they're on hold substantive shared content (a player's
// entered stat line, a logged travel expense, an assigned goal, a qualifier
// selection) that this route must not delete just because the entering
// coach is leaving. (One of these is the deprecated legacy per-player stat
// table named in src/lib/baseball/stat-layer-manifest.ts's
// DEPRECATED_STAT_TABLES — its exact identifier is deliberately not spelled
// out literally here, since this route never reads/writes it and doing so
// would trip the stat-layer-contract scan, #381.):
//
//   coach_id (NOT NULL) on the deprecated legacy per-player stat table above -> baseball_coaches.id
//   baseball_box_score_uploads.coach_id            -> baseball_coaches.id (NOT NULL)
//   golf_goals.created_by_user_id                 -> users.id (NOT NULL)
//   golf_qualifier_selections.selected_by_user_id -> users.id (NOT NULL)
//   golf_travel_expenses.created_by               -> users.id (NOT NULL)
//
// If an account is blocked by one of these, the final `users` delete below
// still fails — but now with an HONEST, actionable 409 (never a silent
// swallow, never a destructive shortcut) instead of an opaque 500. The real
// fix for this residual set is a DB migration (owner sign-off; out of scope
// for this code-only wave) to either loosen these columns to nullable +
// ON DELETE SET NULL (matching every sibling audit column in this schema) or
// introduce a system-reassignment sentinel.
// =============================================================================

async function nullOutColumn(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  column: string,
  matchValue: string,
): Promise<{ label: string; error: string | null }> {
  // Spans many tables/columns with no single shared row shape — the
  // service-role admin client's overloaded `.from()` typing can't express
  // this generically, so this helper is intentionally untyped internally.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from(table as any) as any)
    .update({ [column]: null })
    .eq(column, matchValue);
  return { label: `${table}.${column}`, error: error ? error.message : null };
}

export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let admin;
    try {
      admin = createAdminClient();
    } catch {
      return NextResponse.json(
        { error: 'Account deletion is not configured' },
        { status: 500 }
      );
    }

    const cleanupErrors: string[] = [];
    const recordCleanupError = (results: Array<{ label: string; error: string | null }>) => {
      for (const r of results) {
        if (r.error) cleanupErrors.push(`${r.label}: ${r.error}`);
      }
    };

    // Resolve this user's coach identity in each sport (if any) up front —
    // needed to reassign the NO ACTION-constrained coach-attribution columns
    // before the final `users` delete cascades into baseball_coaches /
    // golf_coaches.
    const [{ data: baseballCoach }, { data: golfCoach }] = await Promise.all([
      admin.from('baseball_coaches').select('id').eq('user_id', user.id).maybeSingle(),
      admin.from('golf_coaches').select('id').eq('user_id', user.id).maybeSingle(),
    ]);

    if (baseballCoach?.id) {
      const bId = baseballCoach.id;
      const results = await Promise.all([
        nullOutColumn(admin, 'baseball_games', 'created_by', bId),
        nullOutColumn(admin, 'baseball_practice_blocks', 'coach_owner_id', bId),
      ]);
      recordCleanupError(results);

      // Invitation/join-code rows this coach created — operational metadata,
      // not team-shared content (see header comment). Safe to remove outright.
      const { error: invitationsError } = await admin
        .from('baseball_team_invitations')
        .delete()
        .eq('created_by_coach_id', bId);
      if (invitationsError) cleanupErrors.push(`baseball_team_invitations: ${invitationsError.message}`);
    }

    if (golfCoach?.id) {
      const gId = golfCoach.id;
      const results = await Promise.all([
        nullOutColumn(admin, 'golf_academic_exclusions', 'excluded_by', gId),
        nullOutColumn(admin, 'golf_announcements', 'created_by', gId),
        nullOutColumn(admin, 'golf_goals', 'coach_id_if_assigned', gId),
        nullOutColumn(admin, 'golf_travel_itineraries', 'created_by', gId),
      ]);
      recordCleanupError(results);
    }

    // NO ACTION-constrained columns referencing users.id directly (mostly
    // admin/CRM attribution — covers the "admin accounts" half of this fix).
    const userLevelResults = await Promise.all([
      nullOutColumn(admin, 'crm_coaches', 'archived_by', user.id),
      nullOutColumn(admin, 'crm_coaches', 'created_by', user.id),
      nullOutColumn(admin, 'crm_contact_log', 'created_by', user.id),
      nullOutColumn(admin, 'crm_email_templates', 'created_by', user.id),
      nullOutColumn(admin, 'crm_events', 'created_by', user.id),
      nullOutColumn(admin, 'golf_task_templates', 'created_by', user.id),
      nullOutColumn(admin, 'golf_team_coachhelm_settings', 'disabled_by', user.id),
    ]);
    recordCleanupError(userLevelResults);

    // Clean up baseball messages
    const { error: baseballMessagesError } = await admin
      .from('baseball_messages')
      .delete()
      .eq('sender_id', user.id);
    if (baseballMessagesError) cleanupErrors.push(`baseball_messages: ${baseballMessagesError.message}`);

    // Clean up golf messages
    const { error: golfMessagesError } = await admin
      .from('golf_messages')
      .delete()
      .eq('sender_id', user.id);
    if (golfMessagesError) cleanupErrors.push(`golf_messages: ${golfMessagesError.message}`);

    // Clean up engagement events this user recorded AS A COACH. `coach_id`
    // on this table references baseball_coaches.id, not the auth user id —
    // resolve it first (previously this matched `coach_id` against the raw
    // auth user id, which almost never equals a baseball_coaches.id, so this
    // cleanup silently deleted 0 rows for every coach).
    if (baseballCoach?.id) {
      const { error: engagementError } = await admin
        .from('baseball_player_engagement_events')
        .delete()
        .eq('coach_id', baseballCoach.id);
      if (engagementError) cleanupErrors.push(`engagement_events: ${engagementError.message}`);
    }

    const { error: userDeleteError } = await admin
      .from('users')
      .delete()
      .eq('id', user.id);

    if (userDeleteError) {
      // 23503 = foreign_key_violation. See the RESIDUAL GAP note in the
      // header comment — a small, documented set of NOT NULL attribution
      // columns (player stats, box score uploads, travel expenses, goals,
      // qualifier selections) can still block deletion because they hold
      // substantive shared content this route must not destroy. Surface
      // that honestly instead of a generic 500.
      if (userDeleteError.code === '23503') {
        await logServerError(
          `Account deletion blocked by FK constraint: ${userDeleteError.message}`,
          { action: 'route.DELETE', userId: user.id, errorCode: userDeleteError.code },
        );
        return NextResponse.json(
          {
            error:
              'Your account has recorded data (e.g. player stats, uploaded box scores, travel expenses, or goals) that must be reassigned by an admin before deletion can complete. Please contact support.',
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to delete account data' },
        { status: 500 }
      );
    }

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(user.id);

    if (authDeleteError) {
      return NextResponse.json(
        { error: 'Failed to delete authentication user' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      warnings: cleanupErrors.length ? cleanupErrors : undefined,
    });
  } catch (error) {
    await logServerError(`Account deletion failed: ${error instanceof Error ? error.message : String(error)}`, { action: 'route.DELETE' });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
