# P016 — Tournaments: wiring

Wired 2026-10-25 behind `golf_tournaments_v1` (off in production) and the
Clubhouse gate, against six held migrations of which three are written
(`docs/clubhouse/held/data/tournaments.md`). Until the owner applies them,
every route draws "Tournaments aren't set up yet" (CH-16302).

## Routes

All nine of plan 14.1, each `page.tsx` with its own `loading.tsx` and
`error.tsx`, rendered by `src/clubhouse/routes/tournaments.tsx`:

Coach and player, by route (`/golf/dashboard/tournaments` and below):

- `/` — coach: the season home; player: their list (placeholder).
- `/[id]` — coach: the event desk (`?tab=`, `round`, `view`, `holes`);
  player: their event (placeholder).
- `/history` — coach: history (`?mode=`, `adjust`).
- `/compare` — coach: compare (`?a=`, `b`, `m`, `bench`, `split`, `event`).
- `/links` — coach: the link inbox (placeholder).
- `/new` — coach: the new-event form (name, the calendar's shared tournament
  fields, an optional qualifier; saves through `createTournamentFromCalendar`
  and opens the desk; `?from=` prefills the name only).
- `/[id]/edit` — coach: the edit form (placeholder).
- `/[id]/lineup` — coach: the lineup builder (placeholder).
- `/[id]/live` — coach: the live round (placeholder; held file 6).

A player on any coach page gets CH-16305.

Flag or Clubhouse off: every page is `notFound()`, before any read. The nav
entry (Team group, after Qualifiers) and the phone strip section come from
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
returning `{ success: false, error, code }` on a refusal:

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

No built view has a control that writes yet, so none is called from a screen.
