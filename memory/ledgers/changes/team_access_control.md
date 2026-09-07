# Change ledger — team_access_control

## 2026-09-07 — team-chat participant management, as a bounded allowance

- SHA: (this commit).
- Change: `supabase/migrations/20260907160000_golf_team_chat_membership_management.sql`
  (WRITTEN, NOT APPLIED — applying it is the owner's step) adds an INSERT branch and
  a DELETE policy on `public.golf_conversation_participants` letting a conversation's
  creator add and remove OTHER participants, plus the definer helper
  `public.golf_user_on_conversation_team(uuid, uuid)` (revoked from `PUBLIC` and
  `anon`, granted to `authenticated`, `set search_path = public, pg_temp`).
  `supabase/tests/rls/golf_group_membership_management.sql` covers it at
  `SELECT plan(14)`.
- Why: add/remove was a POLICY gap, not a wiring gap — verified against live
  production `pg_policies`. The allowance is bounded on three axes taken from
  20260819070000's own words: the conversation must be a team chat with a `team_id`,
  the target user must be on that team, and the actor must still be a participant.
  Everyone keeps the pre-existing right to remove only their own row.
- Correction recorded rather than hidden: GROUP 4 of the pgTAP suite does NOT
  discriminate on the DELETE policy's participation clause. A control run with only
  that clause removed still passed 14/14. The real reason a departed creator cannot
  reach the members who stayed is that Postgres applies SELECT policies to the rows a
  DELETE reads, and `golf_participants_select_v2` has no coach branch — measured
  against local Postgres, in both directions. The clause stays as redundant defence
  and both the migration header and the test header say so.

<!-- schema-drift-absent: golf_group_membership_management, golf_user_on_conversation_team -->
<!--
  `golf_user_on_conversation_team` is a real function, created by
  20260907160000 — which is written and NOT applied, so it is correctly absent
  from the production schema snapshot `db:types` generates. Delete this name
  from the declaration above the moment the owner applies the migration and
  re-runs `npm run db:types`; leaving it here would exempt a real object from
  the drift check.
  `golf_group_membership_management` is not a database object at all — it is
  the pgTAP suite's own filename, which happens to start with `golf_`:
  `supabase/tests/rls/golf_group_membership_management.sql`.
-->
