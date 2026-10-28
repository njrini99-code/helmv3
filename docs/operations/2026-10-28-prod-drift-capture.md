# Production vs migrations drift: read and capture (2026-10-28)

The staging project (PROSP DATA, `ybmwektreyrwjscxlogv`) was built on
2026-10-28 by replaying `supabase/migrations/**`. A schema diff against
production (`qmnssrrolpinvwjjnufo`) showed the two differ. This note records
what differs, which side is right, and what was captured. Every production read
was catalog-only. Nothing was written to production.

## Bottom line

- **Golf logic matches.** 40 functions differ in source text. 33 are the same
  once comments and whitespace are removed. One is `submit_round_atomic`,
  where a single `trace_checkpoint` line sits in a different place (it only
  traces). The other 6 are baseball and lifting functions (listed under
  Owner calls). The Clubhouse round, shot, message and tournament code paths
  behave the same on both.
- **The release plan is not affected.** The anchors that the held
  anchor-patching migrations look for are present in production exactly once:
  `20261001000000` (step-1 anchor in `submit_round_atomic`) and
  `20261023152000` (the DELETE and `insert_shots` anchors).
  `20260928150000` depends on held `20260924120000` (OD-01) and is not in the
  release.
- **Production holds hand-made changes that no migration carries.** Eight
  files in this PR capture them, so a replayed database (staging, a branch, a
  preview) gets what production has. Each one finds its objects already in
  place on production. Every schema change is guarded: policies,
  constraints, indexes, the view and the role are created only when missing,
  the `crm_coaches.conference` NOT NULL is dropped only while it is set, and
  a delete rule is rebuilt only when it differs. So applying a file there
  redefines nothing and takes no table lock beyond what a GRANT or REVOKE
  needs. The grant files re-issue the same grants.
- **Three places where the repo is right and production is behind.** These are
  listed below as forward fixes. They are not captured, because capturing
  them would copy the weaker version into the replay.

## Captured in this PR (production is right)

| file | what production has that a replay lacks |
|---|---|
| `20261028140000_capture_golf_messaging_prod_shape.sql` | `golf_message_mentions` insert and select policies. A replayed database has RLS on and no policy there, so @mentions fail on staging and previews. Also two CHECKs (`golf_message_mentions_target_check`, `golf_messages_payload_matches_kind`), three CHECK names, six FK delete rules (cascade or set null), five indexes, and the anon revoke. |
| `20261028140100_capture_helm_repair_ro_access.sql` | The `helm_repair_ro` NOLOGIN role used by `selfheal-repair.yml`, with authenticator's membership (so PostgREST can switch into it), its grants and four policies. `supabase/roles.sql` makes it only for a local stack. |
| `20261028140200_capture_internal_tables_deny_policies.sql` | RESTRICTIVE deny-all on `admin_allowlist` and `auth_rate_limits` (production ledger row `20260703212357`, no repo file). |
| `20261028140300_capture_coach_directory_prod_shape.sql` | `crm_coaches.conference` nullable (ledger row `20260617023948`), the anon revoke, and the `v_crm_coaches_by_school` view (security_invoker; the body matches production's). |
| `20261028140400_capture_coach_insights_update_grants.sql` | Column-only UPDATE for authenticated on `golf_coach_insights` (the seven columns production allows). The staging build has table-wide UPDATE instead, and a strict replay that runs the OBSOLETE `20260528011000` keeps only two columns. This file ends both at production's seven. |
| `20261028140500_capture_get_user_last_active_revoke.sql` | `get_user_last_active()` is SECURITY DEFINER and returns every user's last activity time. Only postgres and service_role may run it. A replay still lets any signed-in user run it. |
| `20261028140600_capture_realtime_email_tables.sql` | `public.emails` and `public.email_clicks` in `supabase_realtime`. |
| `20261028140700_capture_helm_bridge_feedback_bucket.sql` | The private `helm-bridge-feedback` bucket (8 MB, png, jpeg, webp, gif). No storage policy; service role only. |

All eight are marked **HOLD — CAPTURE** in `HELD.md`. They wait only on the
owner's freeze. They are not on staging yet (see "Replay check").

## What the from-empty replay found (2026-10-28)

With the captures in place, the pgTAP suite runs against production's shape
for the first time. Two tests failed, and both point at real differences:

1. **Deleting a poll fails against production's CHECK.** The app's
   `deleteMessage` clears a golf poll's payload, and the applied
   `20261025020200` poll freeze allows that write. Production's
   `golf_messages_payload_matches_kind` refuses a non-text row with no
   payload, so the delete errors and the coach sees "Failed to delete
   message". `20261028140800_golf_messages_deleted_poll_payload_check.sql`
   (HOLD) widens the CHECK to allow a NULL payload on a deleted row. Apply it
   before Clubhouse polls are used on production. The other way is to keep
   the payload on delete in the app, which needs no database change but
   keeps a deleted poll's question stored.
2. **`coach_insights_player_update.sql` expected two columns.** It encoded
   the OBSOLETE `20260528011000`, which left `authenticated` UPDATE on
   `acknowledged_at` and `dismissed_at` only. The app's acknowledge, dismiss
   and reactivate writes also set `status`, `dismissed`, `lifecycle_state`
   and the rest of production's seven, so the test now checks those seven.
   Content, evidence and `coach_id` stay out of reach, as before.

## Not captured: the repo is right and production is behind

1. **Goal policies (security gap in production).**
   `20260526180000` and `20260528010000` were marked APPLIED-ELSEWHERE in
   `HELD.md`. Production does not carry them:
   - `goals_coach_create` lacks the active-member check. A coach can create a
     goal for any `player_id` under a team they coach, even for a player who is
     not on that team.
   - `golf_goal_suggestions` still has the single `goal_suggestions_player_own`
     FOR ALL policy. A player can insert or delete their own suggestion rows,
     which only the engine (service role) should write.

   **Fix:** apply `20260528010000_reapply_v3_goals_suggestions_rls.sql`, which
   is idempotent (DROP IF EXISTS, then CREATE). App reads and writes stay
   compatible: player actions only select and update suggestions, and the
   writer runs as service role. `HELD.md` now carries a correction on both rows.
2. **anon on `golf_coach_insights`.** Production (and staging) grant anon
   full privileges on the table. RLS still decides which rows anyone sees, so
   anon reads nothing today. The only file that revokes it is the OBSOLETE
   `20260528011000`. **Fix:** a one-line `REVOKE ALL ... FROM anon` forward
   migration when the freeze allows. Not written here because it changes
   production.
3. **`20261023110000_golf_shot_detail_select_set_based.sql`**: the set-based
   fast path for putt and approach-miss detail reads (5.9 s to about 0.2 s per
   coach page). It has no ledger row in production and no
   `golf_shot_detail_round_ids()` function. Earlier `HELD.md` notes calling it
   "applied ahead (#2350)" were wrong. It now has its own HOLD row.

## Harmless differences (no action)

- 33 of the 40 functions differ only in comments and whitespace. The three
  `admin_*_error_fingerprint` functions (found separately) also differ only in
  comments.
- `helm_debug`, `helm_jobs` and `private` schemas: production shows a NULL ACL
  where staging shows an explicit postgres ACL. Both mean the same.
- The `demo_requests` grant lists the same roles in a different order.
- Staging has the `vector` extension and production does not. Nothing uses it.
- Production also has `supabase_realtime_messages_publication`, which
  Supabase manages.

## Ledger

- 311 production ledger versions have no repo file of that version. All are on
  or before 20260825. Of those, 40 names have no repo file with the same name.
  This is the drift already documented in
  `2026-08-26-migration-history-drift.md` and `SUPABASE_DRIFT_GUARD.md`.
- The changes captured above were made in production with no ledger row:
  the messaging extras, `helm_repair_ro`, the `get_user_last_active` revoke,
  the two Realtime tables and the dashboard-made bucket. The
  `golf_coach_insights` grants came from the baseline; replays diverge from
  them because of how the OBSOLETE file is handled.

## Owner calls

1. **Production-only backup tables.** Keep or drop:
   `backup_ci_junk_rounds_20260821`, `backup_class_semester_20260813`,
   `backup_prevyear_classes_20260821`,
   `crm_email_templates_backup_20260720`,
   `schema_migrations_pruned_20260820`, and
   `archive.golf_events_momentic_20260731` (staging has no `archive`
   schema). None is read by the app. Dropping them is irreversible, so it
   waits for the owner.
2. **Baseball and lifting.** 82 of the 89 `baseball_*` and `helm_lifting_*`
   tables differ in at least one of these:
   - policies: 43 tables
   - columns: 41
   - constraints: 38
   - indexes: 37
   - grants: 34
   - triggers: 2

   32 tables differ only in grants (production revoked anon). Six function
   bodies differ:
   - `baseball_accept_staff_invite`
   - `baseball_staff_has_note_capability` (body and settings)
   - `can_manage_baseball_lift_group` (one overload)
   - `can_view_baseball_player` (one overload)
   - `has_baseball_staff_capability`
   - `is_baseball_primary_coach`

   `is_baseball_team_member` also differs in its settings. Production also
   has `can_manage_baseball_lift_group(team, group)`. This is
   left as a list, not a capture, because Helm is golf-first right now and
   baseball is seed data. A capture would mean one file per area, generated
   from the production catalog.
3. **Goal policy fix.** Apply `20260528010000` to production when the freeze
   allows.

## Replay check

Staging has none of the eight files yet. Applying them there was stopped by a
Supabase confirm prompt that got no answer; a read on 2026-10-28 showed no
ledger row, role or bucket from them. CI's RLS job replays every migration
from empty, which covers the replay itself. A direct apply on staging, then a
re-read against production, is the step left.

Staging was copied with data, so check one thing before applying
`20261028140000` there: the `golf_messages_payload_matches_kind` CHECK is
added with validation, and it fails if any existing row has a text message
with a payload or a non-text message without one. On a replay from empty
there are no rows, so it cannot fail.
