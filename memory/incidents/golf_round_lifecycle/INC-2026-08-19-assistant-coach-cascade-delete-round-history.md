# INC-2026-08-19 — an assistant coach could delete a team's entire round history

- Feature: `golf_round_lifecycle`
- Status: CLOSED — fixed in `supabase/migrations/20260819060000_restrict_round_history_delete_to_head_coach.sql`,
  present in this repo; verified 2026-09-05 against the migration file.
- Risk: R3 — protected database lifecycle (owner directive: golf round/shot
  history may never be deleted)
- First reproduced: 2026-08-19 (overnight remediation run)
- Source: auto-memory notes `golf-player-data-is-untouchable.md` (no date
  field) and `rls-predicate-you-submit-is-not-what-you-get.md` dated
  2026-08-20

## Symptom

None observed in production traffic. This was found by an internal RLS audit,
not by a user report or an error signal.

## Root cause

`is_golf_team_coach(team_uuid)` is an EXISTENCE-only predicate — it checks
only whether a `golf_team_coach_staff` row links the caller to the team, and
never reads `role`. The role-checking sibling, `is_golf_team_head_coach()`,
is the predicate a privileged action should use.

Three DELETE policies governing competitive history —
`golf_rounds_delete_coach`, `golf_shots_delete_coach`,
`golf_holes_delete_coach` — trusted the existence-only variant. Deleting a
round CASCADEs to `golf_shots`, `golf_holes`, `golf_round_reviews` and
`golf_round_stats_cache` (verified against `src/lib/types/database.ts`, all
four tables present), with no soft-delete, no export and no recovery path.
Any `assistant_coach` role in `golf_team_coach_staff` — not only the head
coach — could therefore delete a team's entire round/shot history through
these three policies.

Three independent sweeps of the application code found no coach-facing
surface that actually calls these policies: every real deletion of a round,
shot or hole goes through either a `SECURITY DEFINER` RPC that bypasses RLS
and checks `player_id` itself (`submit_round_atomic`,
`save_partial_round_atomic`), or a player-scoped JS fallback authorized by the
player's own policies. So the three coach DELETE policies were not a live
entry point for the product — only an entry point an attacker, or a mistake,
could use.

## Repair

`supabase/migrations/20260819060000_restrict_round_history_delete_to_head_coach.sql`
repoints exactly these three policies from `is_golf_team_coach` to
`is_golf_team_head_coach`, and only these three — the migration's own header
records that 20 total destructive policies (16 DELETE + 4 ALL) use the
existence-only predicate, and tightening all 20 would break ordinary coaching
actions (cancelling a practice, removing a document, reassigning a task) to
fix three. Adoption bound the blast radius further at repair time: only 1 of
10 teams had an assistant coach at all.

## Invariant this establishes

Golf player rounds and shots are an owner-level absolute constraint — they
must never be deletable outside the two paths above. Any new DELETE or ALL
policy touching `golf_rounds`, `golf_shots`, `golf_holes` or
`golf_round_reviews` must use `is_golf_team_head_coach()`, never the
existence-only `is_golf_team_coach()`, and should be checked with the
role-impersonation technique in `memory/context/engineering-methodology.md`
("Row-Level Security" section) before it ships. See also that document's note
on how a bare column reference inside an RLS subquery can silently bind to
the wrong table — a sibling failure class found in the same audit pass, and
the specific reason to read a new policy's stored `pg_policies.qual`/
`with_check` back after creating it rather than trusting the text submitted.

## Regression

The FK cascade map for `golf_players`/`golf_rounds`/`golf_shots`/`golf_holes`
(CASCADE) versus `golf_rounds` → `golf_teams`/`golf_courses`/`golf_course_tees`/
`golf_qualifiers` (SET NULL, which orphans a round rather than destroying it)
was verified directly against `pg_constraint`, not inferred — an earlier,
recursive-query-based verification incorrectly reported the SET NULL hops as
CASCADE by checking only the final hop's delete action. A baseline row-count
snapshot (`golf_rounds` 348, `golf_shots` 24,526, `golf_holes` 6,174,
`golf_players` 94, `golf_round_reviews` 101, measured 2026-08-19) exists as
the "should only ever grow" tripwire for this constraint; a decrease in any
of these tables is this incident's class recurring, not a discrepancy to
explain away.
