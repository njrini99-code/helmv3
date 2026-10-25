# HELD DATA PLAN — Tournaments (P016)

```text
Plan ID: HD-tournaments
Status: HELD
Pages: Tournaments (P016): season home, event desk, lineup, live, compare,
  player event view (all behind golf_tournaments_v1, off)
Feature: calendar_events (memory/registry.yml owns *golf_tournament*.sql)
Migration: supabase/migrations/20261024100000_golf_tournaments.sql
Date: 2026-10-24
```

This plan covers all six held Tournaments migrations. The header names the
first file because the Clubhouse registry reads one migration per plan; the
other five are listed below and must be applied with it, in order, in one
session.

## Requirement

Clubhouse page P016 gives a coach one workspace per tournament (prep, lineup,
live round, result, review) and gives a player their own event view. The
product is approved: decisions D-80 to D-101, approved by the owner as written
on 2026-10-23 (OQ-65, recorded in `docs/clubhouse/PROGRESS.md` on the
Tournaments branches). OQ-65 says the approval covers the product only.
Applying migrations, flipping `golf_tournaments_v1`, merging and deploying stay
with the owner, and every Tournaments SQL file stays HOLD until the owner
applies it.

Source: the Clubhouse A+ handoff, section 4.33 (the Tournaments plan), its
sections 11.1 to 11.7, 11-A, 11-B, 11-L and 5L.9, and the decisions table in
section 0.

## The six migrations, in apply order

| # | File (version) | State |
| --- | --- | --- |
| 1 | `20261024100000_golf_tournaments.sql` | written, HOLD |
| 2 | `20261024100100_golf_tournaments_rls.sql` | written, HOLD |
| 3 | `20261024100200_golf_tournaments_rpcs.sql` | written, HOLD |
| 4 | `20261024100300_golf_tournaments_player_moments` | not written |
| 5 | `20261024100400_notification_preferences_push_tournaments` | not written |
| 6 | `20261024100500_golf_tournament_live` | not written |

Files 1 to 3 are in `supabase/migrations/` and have rows in
`supabase/migrations/HELD.md`. Files 4 to 6 get their rows when they are
written (see the note under the register in HELD.md). The registry claims
one migration per plan, so files 2 and 3 also have short plans of their own:
[tournaments-rls.md](tournaments-rls.md) and
[tournaments-rpcs.md](tournaments-rpcs.md).

### 1. Tables (100000)

Seventeen new tables, all in `public`, all golf-prefixed:

- `golf_tournaments`: one row per tournament edition for one GolfHelm team
  (D-81). Format, counting, holes, rounds, event kind, tiebreak, field size,
  advance or cut line, substitutions, lock minutes, lineup lock, publish and
  official times, results URL (https only), host, `version` for
  compare-and-set. `unique (id, team_id)` is the target of every child's
  composite foreign key, so no child row can claim another team.
- `golf_tournament_rounds`: one row per competition round. The primary key is
  `round_event_id`, a foreign key to an ordinary `golf_events` row
  (`event_type = 'tournament'`, `parent_event_id` left NULL) with
  `ON DELETE RESTRICT`. Status (upcoming, live, suspended, final), start type,
  first tee, course and tee, and `event_adopted` (a calendar event adopted as
  round 1 is not deleted with the tournament).
- `golf_tournament_entries` (lineup, alternate, individual; slot) and
  `golf_tournament_round_lineups` (the per-round snapshot taken at lock and the
  substitution log).
- `golf_tournament_player_rounds`: one row per player per round (D-82). Either
  a link to a `golf_rounds` row (`round_id`, unique, `ON DELETE SET NULL`) or
  an entered score, never both. WD and DQ. `golf_rounds` is never updated.
- `golf_tournament_field_teams` and `golf_tournament_field_scores`: the field
  and each team's total per round, entered by the coach (D-83).
- `golf_tournament_result_marks`: append-only Final, Official and Reopened
  marks with a snapshot and a reason (D-84).
- Coach-only `golf_tournament_entry_notes` (lineup reasoning) and
  `golf_tournament_reviews`; per-player `golf_tournament_player_notes`
  (shared one by one); the player's own `golf_tournament_reflections`.
- `golf_tournament_advice_givers`, `golf_tournament_coach_presence`.
- `golf_saved_comparisons`, `golf_team_seasons` (division, conference,
  official rank per season), `golf_tournament_link_dismissals`.

Also: an index on every foreign key, one new trigger function
`helm_private.touch_tournament_version()` (bumps `updated_at` and `version` on
`golf_tournaments`), `public.touch_updated_at()` triggers on the other tables
with `updated_at`, and RLS enabled on all seventeen with no policy (closed
until file 2). `anon` and `PUBLIC` are revoked; `authenticated` gets select,
insert, update, delete (policies narrow them); `service_role` gets all.

### 2. RLS (100100)

Policies on the seventeen tables and one SECURITY DEFINER read helper,
`public.golf_tournament_round_is_final(uuid)` (executable by `authenticated`
and `service_role`, never `anon` or `PUBLIC`). In short:

- Structure (tournaments, rounds, entries, round lineups, field teams, advice
  givers, team seasons): team coaches and active players read, admins read,
  coaches write.
- Field scores and result marks: the team reads; coaches write. Result marks
  are insert-only (no update or delete policy, and update and delete are
  revoked from `authenticated`).
- Player rounds: a coach reads all; a player reads their own, and a teammate's
  once that round is final. A player may insert only a link to their own
  GolfHelm round, for a round they are in, with no entered score.
- Entry notes and reviews: coaches only (D-85). Player notes: coaches all, the
  player reads their own once shared. Reflections: the player owns theirs,
  coaches read. Coach presence: team coaches read, each coach writes their
  own. Link dismissals: coaches. Saved comparisons: the owning coach, and the
  team's coaches read shared ones.

File 4 replaces four of these player read rules (see below). Until it does,
file 2 lets a player read a lineup the coach is still drafting (handoff
finding 0-R.3 item 3: the builder autosaves entries). That is the main reason
files 1 to 4 must go in together.

### 3. RPCs and the lineup guard (100200, written 2026-10-25)

From handoff 11.4. All `SECURITY INVOKER` with `search_path = ''` unless
stated:

- `golf_tournament_create(jsonb)`: the tournament, one `golf_events` row per
  round day, the round rows; optionally adopts an existing calendar event as
  round 1 (`from_event_id`).
- `golf_tournament_delete(uuid, boolean)`: refuses while rounds are linked
  unless told to unlink; deletes the tournament, then the round-day events it
  owns (not adopted ones).
- `golf_tournament_update(uuid, jsonb, int)`: compare-and-set on `version`
  (`P0001 'stale'`); never removes a round with linked scores.
- `golf_tournament_set_entries`, `golf_tournament_lock_lineup`,
  `golf_tournament_substitute`, `golf_tournament_set_round_status` (the
  allowed transitions; a reopen writes a result mark),
  `golf_tournament_mark`, `golf_tournament_publish` (added in handoff 4.33
  section 13: sets `lineup_published_at` and `reveal_at`), and the read-only
  `golf_tournament_link_candidates(uuid)`.
- Guard trigger `helm_private.guard_tournament_lineup()` on entries and round
  lineups: after lock, changes are refused unless the GUC
  `helm.tournament_write = 'substitute'` is set inside
  `golf_tournament_substitute` (the `guard_golf_round_lifecycle` pattern).

Touches live data only through `golf_events` inserts and deletes made by the
RPCs, on rows they own.

As written: ten RPCs (the list above), every refusal a P0001 whose message
is the bare code (`stale`, `not_coach`, `locked`, `round_order`,
`rounds_linked`, and the rest in the file header). Defaults taken where this
section is silent are in [tournaments-rpcs.md](tournaments-rpcs.md): the
substitute bypass is the GUC alone; leaving `upcoming` takes the lineup
snapshot if the coach has not locked; publish sets `lineup_published_at`
only until file 4 adds `reveal_at`; the guard passes a row whose tournament
is gone, so a delete cascades past a locked lineup.

### 4. Player moments (100300, not written)

From handoff 11-A.2:

- Columns: `squad` on entries and round lineups (slot unique per squad, which
  drops and recreates `golf_tournament_entries_slot_uq`); `reveal_at` and
  `event_group_id` on `golf_tournaments`; `score_source`, `live_thru`,
  `live_to_par`, `official_total` on player rounds; structured prompts on
  reflections (`body` becomes optional).
- New tables: tee sheet (per-player tee time and start hole, not guarded by
  the lineup lock), private lines (D-90), receipts (append-only, added to the
  `supabase_realtime` publication), player hole notes (player-owned, outlives
  the event), prep notes, mutes, push holds (service role only).
- **Alters a live table:** `golf_player_focus_areas.from_tournament_id`
  (nullable, `ON DELETE SET NULL`, partial index, no backfill; D-94).
- Three SECURITY DEFINER read helpers: `golf_tournament_is_revealed`,
  `golf_tournament_round_revealed`, `golf_tournament_viewer_competing`.
- Replaces the player read rules from file 2:
  `golf_tournament_entries_select`, `golf_tournament_round_lineups_select`,
  `golf_tpr_select`, `golf_tpr_player_link`, `golf_tfs_select`, and the player
  notes reader (shared lines only). The handoff draft's policy names match the
  names file 2 uses (checked 2026-10-24).

### 5. The `push_tournaments` preference (100400, not written)

From handoff 11-B. `CREATE OR REPLACE` of the live trigger function
`public.validate_notification_preferences()` on `public.users`, adding
`push_tournaments` to the kept, never-defaulted keys. Without it the new switch
saves and reads back as its default. **Replaces a live function on a hot
table:** re-capture the live body (read-only) before writing the file, and
write it as that body plus one key, not from the handoff text. No table,
policy, grant or data change.

### 6. Live round (100500, not written)

From handoff 5L.9:

- Columns: `live_seq` and `app_scoring` on rounds; live columns on player
  rounds and coach presence.
- New tables: the append-only hole ledger `golf_tournament_hole_entries`,
  resolved `golf_tournament_hole_scores` (trigger-written), live alerts, alert
  preferences, live state (no policies).
- Functions: `helm_private.tour_live_emit` (sequence bump and
  `realtime.send`), `resolve_tournament_hole`, `mirror_tournament_hole`,
  `tour_live_row_changed`, `tour_live_field_changed`; RPCs
  `golf_tournament_enter_holes`, `golf_tournament_live_snapshot`,
  `golf_tournament_live_since`; topic helper
  `golf_tournament_topic_coach(text)`.
- **Touches live objects:** an AFTER INSERT OR UPDATE OF score trigger on
  `public.golf_holes` (D-82; written never to raise, so a player's save cannot
  fail because of it), and the first two policies on `realtime.messages`
  (receive and presence on `tour:<round_event_id>` topics, coaches of that
  round's team only; D-95). It also replaces file 3's
  `golf_tournament_set_round_status` body with a Final check.

## Dependencies on live tables

Checked against `src/lib/types/database.ts` and `supabase/schemas/**` on
2026-10-24. Every column and function files 1 and 2 reference exists:

- `golf_teams.id`, `golf_courses.id`, `golf_course_tees.id`,
  `golf_events.id`, `golf_players.id` and `.user_id`, `golf_rounds.id` and
  `.player_id`, `auth.users.id` (as in
  `20261022090000_golf_player_availability_coach_notes.sql`).
- `public.is_golf_team_coach(uuid)`, `public.is_golf_team_player(uuid)` (active
  members only), `public.is_admin()`, `public.touch_updated_at()`, schema
  `helm_private`.
- For later files: `golf_player_focus_areas` (file 4), `golf_holes.score`,
  `.putts`, `.gir` (file 6 and Q-173; the columns exist),
  `public.users.notification_preferences` (file 5). `golf_events.event_type`
  has no check constraint, so `'tournament'` needs no schema change.

Foreign keys from new tables to live ones: `golf_events` (RESTRICT),
`golf_rounds` (SET NULL; CASCADE on link dismissals), `golf_players`,
`golf_teams`, `golf_courses`, `golf_course_tees`, `auth.users`. Creating them
takes brief locks on those tables; files 1 and 2 cap the wait with
`set local lock_timeout = '3s'`.

## Risk

- **File 1: low on its own.** New tables only, no data. One behavior change on
  live tables once rows exist: a round-day `golf_events` row cannot be deleted
  while a tournament round points at it (RESTRICT). Before any tournament is
  created (flag off), nothing changes.
- **File 2: low.** Policies on new tables, one read helper. Not safe to leave
  without file 4 once players use the flag (draft-lineup read).
- **File 3: medium.** Writes `golf_events` rows; the lineup guard is the
  integrity boundary.
- **File 4: medium.** Alters live `golf_player_focus_areas` (additive).
- **File 5: low to medium.** Replaces a live trigger function on
  `public.users`; a wrong body changes every user's saved preferences on their
  next write.
- **File 6: high.** A trigger on `golf_holes` (every round save) and the first
  `realtime.messages` policies. Needs `db-migration-reviewer` and pgTAP first
  (handoff 5L.9 list: replay `save_partial_round_atomic` twice and assert one
  ledger entry per hole; force the mirror to fail and assert the save still
  succeeds).

## Apply path and order

The files have no BEGIN or COMMIT. `db:apply` sends the file and its ledger
insert as one body that the Management API runs in one transaction
(`scripts/db/apply.mjs` header), so `set local lock_timeout` holds and the
file commits or rolls back whole. An explicit `commit;` in a file would end
that transaction early. Apply with
`npm run db:apply -- <file> --held-override <file name> --reason "..."` (or
the `db-apply` workflow), never by pasting into a SQL editor. Order 1, 2, 3, 4,
5, 6, in one session, each one's VERIFY passing before the next. Then
`npm run db:types`, `npm run test:rls`, and only then the owner's flag flip.

## What reads these tables

Nothing until `golf_tournaments_v1` is on. The flag is planned in
`config/feature-flags.yml` (off, requires `golf_clubhouse_ui`); every
Tournaments loader and action checks it before any read, so with the flag off
no code queries a missing table. The preview route renders from fixtures and
needs no table. Until `npm run db:types` runs after the apply, the tables are
typed by hand in one module, `src/lib/golf/tournaments-tables.ts` (handoff
11.7; in `src/lib` so the server actions may import it too); that module is
deleted in the same PR that regenerates the types.

## Privacy / sensitive data

Players are often minors. Coach-only data (lineup reasoning, reviews, unshared
debrief lines, presence) has no player policy. Teammates' tournament scores
are hidden until a round is final, but this is not a boundary over
`golf_rounds` and `golf_holes`, which teammates can already read (D-36; D-85
says so). Reflections are read by coaches, and the screen says so (D-94).

## Rollback

- File 1: the header's `-- ROLLBACK:` block drops the seventeen tables in
  reverse dependency order, then `helm_private.touch_tournament_version()`.
  Clean before first use. After use it loses all tournament data, and any
  round-day `golf_events` rows the RPCs created stay on the calendar as
  ordinary tournament events (delete them by id from the dropped rounds table
  first if that matters).
- File 2: drop the policies it creates and
  `public.golf_tournament_round_is_final(uuid)`. RLS stays on, so the tables
  close.
- File 3: drop the RPCs and the guard trigger and function.
- File 4: drop the new tables and functions, restore file 2's four player
  read policies and the player notes reader, drop the added columns;
  `golf_player_focus_areas.from_tournament_id` last (nullable, unused by
  existing code, loses only tournament links).
- File 5: re-run the applied `20261017100000` body (or the body captured
  before the apply).
- File 6: drop the `golf_holes` trigger first, then the two
  `realtime.messages` policies, then the live tables, functions and columns.

## Verification after apply

Each written file's `-- VERIFY:` lines run inside `db:apply` and must each
return a row. Run these as well, read-only:

```sql
-- File 1: 17 tables, all with RLS on
select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and c.relname in ('golf_tournaments', 'golf_tournament_rounds',
    'golf_tournament_entries', 'golf_tournament_round_lineups',
    'golf_tournament_player_rounds', 'golf_tournament_field_teams',
    'golf_tournament_field_scores', 'golf_tournament_result_marks',
    'golf_tournament_entry_notes', 'golf_tournament_reviews',
    'golf_tournament_player_notes', 'golf_tournament_reflections',
    'golf_tournament_advice_givers', 'golf_tournament_coach_presence',
    'golf_saved_comparisons', 'golf_team_seasons',
    'golf_tournament_link_dismissals');            -- expect 17

-- File 1: anon holds nothing on any of them
select count(*) from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
  and (table_name like 'golf_tournament%'
    or table_name in ('golf_saved_comparisons', 'golf_team_seasons'));
                                                    -- expect 0

-- File 2: policies present; result marks cannot be updated or deleted
select tablename, count(*) from pg_policies
where schemaname = 'public'
  and (tablename like 'golf_tournament%'
    or tablename in ('golf_saved_comparisons', 'golf_team_seasons'))
group by tablename order by tablename;    -- 17 rows, 32 policies in all
select has_table_privilege('authenticated',
  'public.golf_tournament_result_marks', 'UPDATE'); -- expect false
```

Planned checks for the later files: file 4, `from_tournament_id` exists on
`golf_player_focus_areas` and the three helpers are not executable by `anon`;
file 5, a `push_tournaments: false` write to a test user reads back false;
file 6, the `golf_holes_mirror_tournament` trigger exists and the two
`realtime.messages` policies exist. pgTAP for files 2 and 4 goes in
`supabase/tests/rls/` (not written yet; handoff 11-A.2 lists the cases).

## Open questions

Recommended defaults are what the next agent should build to.

- **OQ-65 (settled for product, open for apply).** The owner approved D-80 to
  D-101; applying any of the six is a separate owner go. Default: all six stay
  HOLD.
- **RESTRICT and team deletion.** `golf_events.team_id` cascades from
  `golf_teams`, and `golf_tournament_rounds.round_event_id` restricts. Deleting
  a team that has a tournament may fail when the cascade reaches
  `golf_events` before it reaches the round rows, because RESTRICT is checked
  at once and not at the end of the statement. Default: test a team delete on
  the local stack before apply; if it fails, change the key to
  `ON DELETE NO ACTION` (checked at the end of the statement) in file 1 before
  it is applied.
- **A round's team is not tied to its event's team.** Nothing checks that
  `golf_tournament_rounds.team_id` equals the linked `golf_events.team_id`, so
  a coach writing the table directly could attach another team's event (and,
  through RESTRICT, block its deletion). Similar gaps: player rounds' `round_id`
  and `player_id`, entries' `player_id`, and result marks' `round_event_id` are
  not checked against the team. Default: add a check in file 1 (a trigger, or
  an `exists` in the coach write policy for rounds), and have file 3's RPCs
  validate roster and team as planned.
- **BEGIN and COMMIT in the handoff drafts.** The drafts for files 4 and 6 wrap
  themselves in a transaction; files 1 and 2 do not. Default: drop them so all
  six match and `db:apply` owns the transaction (its own `commit;` would end
  the apply transaction before the ledger row is written).
- **Decision status in the drafts.** The handoff's HELD reasons for files 4 and
  6 say D-85 and D-87 to D-94 are "pending" or "proposed". They were approved
  (OQ-65, handoff X-19). Default: write "approved 2026-10-23 (OQ-65)".
- **Realtime API (file 6).** `realtime.send`, `realtime.topic()` and
  `realtime.messages.extension` cannot be checked from the repo. Default:
  confirm on the local stack's Realtime version before writing file 6.
- **Q-173 (putts per GIR).** `golf_holes` has `putts` and `gir`. Default stays
  as the PROGRESS entry says (drop putts per GIR from v1) until coverage of
  those columns is measured.
- **Q-168 (itinerary RLS)** stays out of these six files; a separate held
  migration if the owner wants it.
- **Registry claim (settled 2026-10-25).** The registry claims one migration
  per plan, so files 2 and 3 have short plans of their own
  ([tournaments-rls.md](tournaments-rls.md),
  [tournaments-rpcs.md](tournaments-rpcs.md)), all three are listed in the
  P016 manifest's `held`, and its data status is `held`. Files 4 to 6 get one
  each when written.
- **Turning it on.** File 2 without file 4 lets a player read a lineup the
  coach is still drafting, through PostgREST, whatever the loader does.
  Default: production's `golf_tournaments_v1` stays off until file 4 is
  written and applied, unless the owner accepts that exposure for a
  coach-only start in writing.

## SQL preparation status

```text
WRITTEN — HOLD — NOT APPLIED     (files 1 to 3)
NOT WRITTEN                      (files 4 to 6)
```

Files 1 to 3 start with `-- STATUS: WRITTEN — HOLD — NOT APPLIED`. On
2026-10-25 files 1 to 3 were applied in order to a scratch Postgres 16 with
stub live tables, and `supabase/tests/rls/golf_tournaments_rpcs.sql` (file
3's pgTAP) passed 16 of 16 under a pgTAP shim; a team delete with a locked
tournament cascaded cleanly. Not yet run on the local Supabase stack
(`npm run test:rls`); no pgTAP for files 1 and 2 yet. The three files are
mirrored under `supabase/schemas/**` (generated by `pg_dump` of that scratch
database, appended under a marked header in each file).

## HELD.md registration

```text
Required: yes
Registered: supabase/migrations/HELD.md, rows
  20261024100000_golf_tournaments.sql (HOLD) and
  20261024100100_golf_tournaments_rls.sql (HOLD), 2026-10-24, and
  20261024100200_golf_tournaments_rpcs.sql (HOLD), 2026-10-25, each linking
  this plan; files 4 to 6 noted under the register, rows added when written.
```

## Activation checklist

- [ ] current schema re-read (the dependencies above)
- [ ] files 4 to 6 written, each with a HELD.md row (file 3 written
  2026-10-25)
- [ ] open questions above answered or defaulted in the SQL
- [ ] all six run on the local stack; team delete tested
- [ ] `npm run test:rls` green (pgTAP for files 2, 4 and 6)
- [ ] `db-migration-reviewer` on all six (file 6 required)
- [ ] owner authorization to apply
- [ ] sanctioned apply path (`npm run db:apply`), order 1 to 6, one session
- [ ] DB types regenerated (`npm run db:types`); hand typing removed
- [ ] verification queries above pass
- [ ] owner flips `golf_tournaments_v1`
- [ ] held status discharged (HELD.md rows, this plan)
