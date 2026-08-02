import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

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
//
// ORDER OF OPERATIONS (deepsec wave 2) — this route is NOT a transaction.
// Every PostgREST call below auto-commits on its own, so a 409 from the final
// `users` delete leaves behind whatever earlier statements already destroyed.
// Three changes make that honest:
//
//   1. PRE-FLIGHT, DON'T PRE-DESTROY. `countBlockingRows` probes the NOT NULL /
//      NO ACTION tables above with `head: true` (no rows transferred, nothing
//      mutated) BEFORE any write, so the documented 409 is returned while the
//      account is still fully intact. It is deliberately not exhaustive — the
//      deprecated legacy per-player stat table cannot be named here (see #381
//      above) — so the 23503 branch remains as the honest backstop.
//   2. NO REDUNDANT DESTRUCTION. The `baseball_messages` / `golf_messages`
//      deletes that used to run here are gone: `baseball_messages_sender_id_fkey`
//      and `golf_messages_sender_id_fkey` are both ON DELETE CASCADE
//      (20260527000000_prod_public_baseline.sql:15071, :15866), so a successful
//      `users` delete removes those rows anyway. Running them first was
//      redundant on success and pure irreversible loss on the 409 path.
//   3. IRREVERSIBLE LAST. `baseball_player_engagement_events` rows are now
//      ENUMERATED before the `users` delete and DELETED after it succeeds. The
//      coach_id FK is ON DELETE SET NULL (:15106) so it never blocks the
//      cascade — but it also means the ids must be captured up front, because
//      the cascade nulls `coach_id` and the rows become untargetable by coach.
//      `baseball_team_invitations` is the one destructive statement that MUST
//      stay ahead of the `users` delete: its `created_by_coach_id` is NOT NULL
//      with NO ACTION (:15216), i.e. it is itself a blocker.
//
// The durable fix is still a single atomic server-side routine; see the
// `needsMigration` note carried with this change.
// =============================================================================

/**
 * The one 409 body this route emits, shared by the pre-flight probe and the
 * 23503 backstop so a caller cannot tell which one fired (and so the copy
 * cannot drift between them).
 */
const BLOCKED_BY_ATTRIBUTION_MESSAGE =
  'Your account has recorded data (e.g. player stats, uploaded box scores, travel expenses, or goals) that must be reassigned by an admin before deletion can complete. Please contact support.';

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

/**
 * Read-only probe for rows that will HARD-BLOCK the final `users` delete.
 *
 * Each entry below was confirmed against the schema baseline as NOT NULL with
 * an ON DELETE NO ACTION foreign key, so a single surviving row guarantees a
 * 23503 — which means this probe can never produce a false 409. `head: true`
 * transfers no rows and mutates nothing.
 *
 * NOTE ON THE SELECT LIST: the probe selects the FILTER column, not `id`.
 * `golf_qualifier_selections` has no `id` column at all — its columns are
 * (coach_reasoning, player_id, qualifier_id, selected_at, selected_by_user_id,
 * selection_type), see src/lib/types/database.ts — so `.select('id')` made
 * PostgREST answer 42703/400 on every deletion request: the probe was
 * permanently dead AND a raw schema error was pushed into `cleanupErrors`,
 * which this route returns to the client as `warnings`. Selecting the column
 * we already filter on is correct for every entry by construction, and stays
 * correct for any entry added later.
 */
const USER_BLOCKING_TABLES: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'golf_goals', column: 'created_by_user_id' },
  { table: 'golf_qualifier_selections', column: 'selected_by_user_id' },
  { table: 'golf_travel_expenses', column: 'created_by' },
];

/** Same, but keyed on `baseball_coaches.id` rather than the auth user id. */
const BASEBALL_COACH_BLOCKING_TABLES: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'baseball_box_score_uploads', column: 'coach_id' },
];

async function countBlockingRows(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  column: string,
  matchValue: string,
): Promise<{ label: string; count: number; error: string | null }> {
  // Same generic-table constraint as nullOutColumn above.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (admin.from(table as any) as any)
    .select(column, { head: true, count: 'exact' })
    .eq(column, matchValue);
  return {
    label: `${table}.${column}`,
    count: typeof count === 'number' ? count : 0,
    error: error ? error.message : null,
  };
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

    const baseballCoachId: string | null = baseballCoach?.id ?? null;

    // ---------------------------------------------------------------------
    // PRE-FLIGHT: answer the 409 while the account is still whole.
    // ---------------------------------------------------------------------
    const probes = await Promise.all([
      ...USER_BLOCKING_TABLES.map((t) => countBlockingRows(admin, t.table, t.column, user.id)),
      ...(baseballCoachId
        ? BASEBALL_COACH_BLOCKING_TABLES.map((t) =>
            countBlockingRows(admin, t.table, t.column, baseballCoachId),
          )
        : []),
    ]);
    for (const probe of probes) {
      // A probe that itself failed is not evidence of a blocker — record it and
      // let the 23503 branch below stay authoritative.
      if (probe.error) cleanupErrors.push(`preflight ${probe.label}: ${probe.error}`);
    }
    const blockers = probes.filter((p) => !p.error && p.count > 0).map((p) => p.label);
    if (blockers.length > 0) {
      await logServerError(
        `Account deletion blocked by NOT NULL attribution rows: ${blockers.join(', ')}`,
        { action: 'route.DELETE', userId: user.id },
      );
      return NextResponse.json({ error: BLOCKED_BY_ATTRIBUTION_MESSAGE }, { status: 409 });
    }

    // Enumerate (do NOT yet delete) the engagement events this user recorded AS
    // A COACH. `coach_id` references baseball_coaches.id, not the auth user id.
    // The rows are removed only after the `users` delete succeeds — but the ids
    // must be captured now, because that delete cascades into baseball_coaches
    // and SET NULLs `coach_id`, leaving the rows untargetable by coach.
    const engagementEventIds: string[] = [];
    if (baseballCoachId) {
      const { data: engagementRows, error: engagementReadError } = await fetchAllRowsResult<{ id: string }>(
        (from, to) =>
          admin
            .from('baseball_player_engagement_events')
            .select('id')
            .eq('coach_id', baseballCoachId)
            .order('id', { ascending: true })
            .range(from, to),
      );
      if (engagementReadError) {
        cleanupErrors.push(`engagement_events (enumerate): ${engagementReadError.message}`);
      }
      for (const row of engagementRows ?? []) engagementEventIds.push(row.id);
    }

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

    // NOTE: baseball_messages / golf_messages are intentionally NOT deleted
    // here — both sender_id FKs are ON DELETE CASCADE, so the `users` delete
    // below removes them. See point 2 of the ORDER OF OPERATIONS note above.

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
        return NextResponse.json({ error: BLOCKED_BY_ATTRIBUTION_MESSAGE }, { status: 409 });
      }

      return NextResponse.json(
        { error: 'Failed to delete account data' },
        { status: 500 }
      );
    }

    // The `users` delete committed — everything from here on is cleanup that
    // can no longer strand a half-deleted account. The engagement rows are
    // removed by the ids captured before the delete, because the cascade has
    // already SET NULL their `coach_id`.
    for (const batch of chunkIds(engagementEventIds)) {
      const { error: engagementError } = await admin
        .from('baseball_player_engagement_events')
        .delete()
        .in('id', batch);
      if (engagementError) {
        cleanupErrors.push(`engagement_events: ${engagementError.message}`);
        break;
      }
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
    await logServerError(`Account deletion failed: ${describeError(error)}`, { action: 'route.DELETE' });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
