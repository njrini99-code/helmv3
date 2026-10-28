# HELD DATA PLAN — Players read their own visible practice reviews (BaseballHelm)

```text
Plan ID: HD-baseball-practice-reviews-player-read
Status: HELD
Pages: BaseballHelm player Practice (/baseball/player/practice), the
       "From your coach" section on each practice card
Feature: baseball_practice (practice effectiveness reviews)
Migration: supabase/migrations/20261028120000_baseball_practice_reviews_player_read.sql
Date: 2026-10-28
```

This is a BaseballHelm table, not a Clubhouse (golf) one. The note lives here
because this folder is where the held protocol
(`docs/clubhouse/foundation-v2/07_HELD_FEATURE_AND_MIGRATION_PROTOCOL.md`)
keeps held data plans.

## Requirement

Owner call, 2026-10-28 (open since the PR 2351 follow-up): a player sees the
practice reviews a coach marked visible to them, only those, and only their
own. Reviews the coach keeps staff-only stay hidden.

## Current schema

`baseball_practice_effectiveness_reviews` has `visibility`
(`staff_only` default, `player_visible`, `restricted`) and `player_ids uuid[]`.
Production (read-only, 2026-10-28) has four policies: select is
`is_baseball_team_staff(team_id)`, and insert, update and delete need
`can_manage_practice`. No player can read any row. The table has 0 rows.

The file `20260624000094` also wrote `bpe_player_read_visible` (any active
team member reads every `player_visible` review of the team). It never
reached production; it exists only in a stack replayed from migrations.

## Proposed change

Policy only, no table, column, grant or data change:

- add `baseball_practice_effectiveness_reviews_select_player`, `FOR SELECT TO
  authenticated USING (visibility = 'player_visible' AND
  (select get_my_baseball_player_id()) = ANY (player_ids) AND
  is_baseball_team_member(team_id))`
- `DROP POLICY IF EXISTS bpe_player_read_visible` (a no-op in production)

## RLS / permissions

- A player reads a review only when it is `player_visible`, names them in
  `player_ids`, and they are an active member of its team.
- `staff_only` and `restricted` stay staff-only. A teammate's review and a
  team-level review with no players reach no player.
- Staff reads and all writes are unchanged. Players still cannot write.
- Visible rows are readable whole through the API (row-level security has no
  column split here). The app selects only id, practice, focus area,
  conclusion, verdict, visibility and players. The coach's choice to mark a
  review visible is the consent for that row.

## Compatibility and fallback

`getPlayerPractices` reads the reviews for the listed practices through the
player's own session. Before the apply RLS returns no rows, so each practice
has `coachReviews: []` and the card draws no review section. A failed read
also yields `[]`, never an error. The same rule (visible and naming this
player) is applied again in `src/lib/baseball/read-models/player-practice-reviews.ts`.

## Gap

`setReviewVisibility` (`src/app/baseball/actions/practice-effectiveness.ts`)
exists, but no coach screen calls it, so nothing can become
`player_visible` from the app yet. A coach toggle is a separate change.

## Rollback

```sql
drop policy if exists "baseball_practice_effectiveness_reviews_select_player"
  on public.baseball_practice_effectiveness_reviews;
```

Players read nothing again. Staff paths are untouched.

## SQL preparation status

```text
WRITTEN — HOLD — NOT APPLIED
```

The first line starts with that header and adds "BaseballHelm, not a
Clubhouse page.": `clubhouse:check` treats a first line that is exactly the
header as a Clubhouse page's held migration and needs a page to claim it.

pgTAP: `supabase/tests/rls/baseball_practice_reviews_player_read.sql`
(behavioral, seeded) and the updated
`supabase/tests/rls/baseball_practice_effectiveness_visibility.sql`. CI replays
every migration and runs both.

## HELD.md registration

```text
Required: yes
Registered: supabase/migrations/HELD.md, row
20261028120000_baseball_practice_reviews_player_read.sql (HOLD), 2026-10-28.
```

## Activation checklist

- [ ] current policies re-read in production
- [ ] migration reviewed
- [ ] pgTAP green in CI
- [ ] owner authorization
- [ ] sanctioned apply path (`npm run db:apply`)
- [ ] `bpe_player_read_visible` reclassified to superseded in
      `scripts/db/ledger-vs-catalog-accepted.json`
- [ ] a coach toggle ships (or is decided against)
- [ ] a player sees their own visible review; a teammate does not
- [ ] held status discharged (HELD.md row, this plan)
