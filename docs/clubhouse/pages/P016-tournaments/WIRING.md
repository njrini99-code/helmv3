# P016 — Tournaments: wiring

Wired 2026-10-25 behind `golf_tournaments_v1` (off in production) and the
Clubhouse gate, against six held migrations of which three are written
(`docs/clubhouse/held/data/tournaments.md`). Until the owner applies them,
every route draws "Tournaments aren't set up yet" (CH-16302).

Checked against the code on 2026-11-17. The flag has been on in production since
2026-10-30 (#2426, every feature flag on); `config/feature-flags.yml` still
lists it. Files 1 to 3 and P-5's two calendar files were applied on 2026-10-25,
the round-write fix on 2026-10-31, the player reveal (file 4, `20261024100300`)
is in the production ledger (verified 2026-11-15) and the B team
(`20261116091000`) was applied on 2026-11-16 (`supabase/migrations/HELD.md`).
Files 5 and 6 (`20261024100400`, the push preference, and `20261024100500`, the
live hole feed) are not written. The Clubhouse gate went with Fairway on
2026-11-14 (#2527): `isTournamentsFor` in `src/clubhouse/gate.ts` asks the flag
and then only the role. CH-16302 is still drawn when a tournament table is
missing.

## Routes

All nine of plan 14.1, each `page.tsx` with its own `loading.tsx` and
`error.tsx`, rendered by `src/clubhouse/routes/tournaments.tsx`:

Coach and player, by route (`/golf/dashboard/tournaments` and below):

- `/` — coach: the season home; player: their list (`PlayerEvent`).
- `/[id]` — coach: the event desk (`?tab=`, `round`, `view`, `holes`), with
  Import results and Enter holes (2026-11-15) and Export (CSV); player: their
  event (`PlayerEvent`: the published lineup, Your card and the reflection).
- `/history` — coach: history (`?mode=`, `adjust`).
- `/compare` — coach: compare (`?a=`, `b`, `m`, `bench`, `split`, `event`).
- `/links` — coach: the link inbox (`LinkInbox`).
- `/new` — coach: the new-event form (name, the calendar's shared tournament
  fields, an optional qualifier; saves through `createTournamentFromCalendar`
  and opens the desk; `?from=` prefills the name only).
- `/[id]/edit` — coach: the edit form (`EventForm`, as `/new`).
- `/[id]/lineup` — coach: the lineup builder (`LineupBuilder`; A and B teams
  since 2026-11-16).
- `/[id]/live` — coach: the live round (`LiveRound`, `?round=`; hole scores
  re-read every 30 seconds; the broadcast hole feed is held file 6, not
  written).

The placeholders (`TourPlaceholder`, CH-16301) were replaced by these screens on
2026-11-07 (`changes/2026-11-07-first-release-screens.md`).

A player on any coach page gets CH-16305.

Flag off, or a session with neither role: every page is `notFound()`, before any
read (the Clubhouse gate it also asked was removed on 2026-11-14). The nav entry
(Team group, after Qualifiers) and the phone strip section come from
`ChShellData.tournaments`, set by the dashboard layout.

## Data

`src/clubhouse/data/tournaments.ts` (server only), over the hand-typed
`tournaments-tables.ts` and the pure `tournaments-shape.ts`. Each loader
answers ready, `not_set_up` (CH-16302), `missing` (CH-16304) or `failed`
(CH-16201). Sections whose own read fails carry their `errors` flag. Left
empty rather than invented until their engines exist: the season path, the
counting ladder and heat map, findings and the story, review leaks and season
comparisons, history splits, travel, count chance and projections. The player
loader reads events, dates and the player's own rows only (D-85).

## Actions

`src/app/golf/actions/tournaments.ts`, coach only, each behind the flag and
returning `{ success: false, error, code }` on a refusal (the words for each
code are in `src/lib/golf/tournament-refusals.ts`, read by
`screens/tournaments/tour-write.ts`):

- `createTournament`, `updateTournament`, `deleteTournament`: RPCs
  `golf_tournament_create`, `_update` (refuses `stale`), `_delete` (refuses
  `rounds_linked`).
- `setTournamentEntries`, `lockTournamentLineup`,
  `substituteTournamentPlayer`, `publishTournamentLineup`: `_set_entries`,
  `_lock_lineup`, `_substitute`, `_publish`.
- `setTournamentRoundStatus`, `markTournament`: `_set_round_status`
  (`round_order`, `bad_transition`), `_mark` (`not_final`).
- `linkTournamentRound`, `enterTournamentScore`, `dismissTournamentLink`,
  `saveTournamentReview`: plain upserts the 100100 policies allow a coach.

Since 2026-11-07 the built views call them: the edit form (`updateTournament`),
the live round (`setTournamentRoundStatus`, `enterTournamentScore`), the lineup
builder (`setTournamentEntries`, `lockTournamentLineup`,
`publishTournamentLineup`) and the link inbox (`linkTournamentRound`,
`dismissTournamentLink`).

Other action files the screens call:

- `src/app/golf/actions/tournaments-calendar.ts` (P-5, shared with the
  calendar): `createTournamentFromCalendar` (the new-event form),
  `setTournamentCancelled` and `untrackTournament` (the desk's
  `track-actions.tsx`); `updateTournamentRound` is called from the calendar
  only.
- `src/app/golf/actions/tournaments-holes.ts`: `saveTournamentHole`, one hole on
  the player's own `golf_rounds` row linked to the tournament round
  (`HoleSheet`, from the live round and the player's Your card; 2026-11-07). Not
  in the manifest's actions.
- `src/app/golf/actions/tournaments-player.ts`: `saveTournamentReflection`, the
  player's reflection. Not in the manifest's actions.
- `src/app/golf/actions/tournaments-import.ts`: `importTournamentResults`
  (ACT-P016-IMPORT-RESULTS, 2026-11-15), used by Import results and Enter holes.
- Export results (ACT-P016-EXPORT-RESULTS): `saveCsv` in
  `src/clubhouse/lib/csv.ts`, through `ui/ExportButton.tsx`; it writes a file on
  the device and nothing on the server.
