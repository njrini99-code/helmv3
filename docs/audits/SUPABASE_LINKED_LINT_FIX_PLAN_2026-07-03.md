# Supabase Linked Lint Fix Plan - 2026-07-03

## Scope

Plan only. Do not mutate the linked database from this pass.

Linked lint reported two errors:

- `public.can_manage_baseball_lift_group` references missing relation `public.baseball_strength_groups`.
- `public.baseball_accept_staff_invite` references missing record field `v_invitation.invitee_email`.

## Error 1: `can_manage_baseball_lift_group`

Current local migration `20260624000050_baseball_rls_helpers_and_policies.sql` defines `can_manage_baseball_lift_group(p_team_id uuid, p_player_id uuid)` as a capability plus player-visibility check. That definition does not reference `baseball_strength_groups`.

The linked lint error likely means production has an older function body that still resolves group scope through `public.baseball_strength_groups`, while `20260704090000_graveyard_legacy_liftlab_tables_phase3.sql` moves legacy Lift Lab tables, including `baseball_strength_groups`, from `public` to `graveyard`.

Recommended fix path:

1. Fetch the live function body with a read-only query against `pg_get_functiondef('public.can_manage_baseball_lift_group(uuid, uuid)'::regprocedure)`.
2. Confirm whether the second argument is currently treated as a player id or a group id in live policies and app calls.
3. If the intended contract is the current local contract, add a migration that re-emits the local helper body and grants.
4. If group scope is still required, rewrite it against `helm_lifting_groups` / `helm_lifting_group_members` after mapping legacy `team_id` to the Helm Lifting organization model.
5. Add or update an RLS regression covering staff with `can_manage_lifting`, player self access, and non-owning player denial.

Do not restore `public.baseball_strength_groups` just to satisfy the function. That would undo the Lift Lab graveyard migration.

## Error 2: `baseball_accept_staff_invite`

Local migrations define `baseball_accept_staff_invite(p_token text)` twice:

- `20260624000062_baseball_accept_staff_invite_rpc.sql`
- `20260624000081_baseball_staff_roles_scope_audit.sql`, which supersedes the earlier function

The current local superseding function loads `v_invite public.baseball_staff_invitations%ROWTYPE` and checks `lower(v_invite.email) <> v_email`. It does not reference `v_invitation.invitee_email`.

The linked lint error likely means production has an older or manually edited function body with a record variable named `v_invitation` whose SELECT list does not include `invitee_email`, or whose backing table no longer has that column.

Recommended fix path:

1. Fetch the live function body with `pg_get_functiondef('public.baseball_accept_staff_invite(text)'::regprocedure)`.
2. Fetch the live `public.baseball_staff_invitations` columns from `information_schema.columns`, especially `email`, `invitee_email`, `status`, `expires_at`, `accepted_at`, and `accepted_by_user_id`.
3. Confirm which email column the app writes. The server action is at `src/app/baseball/actions/staff.ts` and calls `baseball_accept_staff_invite`.
4. Prefer re-emitting the current local `20260624000081` function body if the live table has `email` and the capability columns expected by that migration.
5. Add a regression for wrong-email rejection and successful accept materializing staff capabilities.

Do not add an `invitee_email` column without confirming product intent and current writers.

## Verification After A Reviewed Migration

```bash
npm run test:rls
npm run test:business
npm run build
supabase db lint --linked --schema public --level warning --fail-on warning
```

If Docker is available, also run a linked diff workflow in a disposable environment. The previous `supabase db diff --linked --schema public` attempt failed because Docker was not running.
