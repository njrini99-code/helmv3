# Wiring pass: coachhelm-team (4 Nov 2026)

Checked against helmv3 03d9087, read only. Written: `coachhelm-team/06-SCREEN-SPECS.md` and `08-ACCEPTANCE.md` (`## Wiring, 4 Nov 2026`, W-TEAM-1 to W-TEAM-20), with pointer lines under both H1s. Shot tracking: nothing changes; figures come from `loadSeasonRounds` round rows and stored evidence, never `golf_shots`.

## 1. Gaps found and filled (11)
- Data (4): Course grouping needs `course_id`. `ROUND_COLUMNS` (`data/season.ts:54`) already has `course_name` and `score_to_par`, so one column is added. `teamPatternsOf` returns null both when its flag is off and when it fails, so the loader checks `teamPatternEnabled()` first and a null with the flag on reads as failed. Working on can't take proposed rows from the brief, because `readFocus` (`data/coachhelm-coach-brief.ts:22`) reads only active and in_progress; they come from the loader's `ChInsight.assigned === 'proposed'`. The page type lacks `open` and `insight` for the deep links; it is a type-only fix.
- Actions (1): the read sheet's part-failed state named a strip and holes the Team host doesn't load. Its parts are now the `ChBoardMissing` ones (drill text, focus status, Tour), and Try again is `router.refresh()`.
- Privacy (1): `getTopInsightsForPlayers` trusts the caller's ids (the comment above `insight-delivery.ts:1113`), so ids come only from the resolved roster, never the address. The team pool row needs at least 5 players.
- Notifications (2): Assign sends the player a bell row and an email gated by `email_task_reminders`; no push. Re-check runs the engine, whose `notifyInsightLanded` can push players on a lifecycle change. Both are today's behaviour.
- Flags (1): `readOn` and `fileOn` are props; no client module reads a flag.
- Handoffs (2): one shared `ReadPanel` (Lenses imports it), with "Open the full read" through `readHref`, which with Read off falls back to `coachReadHref`. The Practice entry is absent; the contract mismatch is in section 5.

## 2. Citations moved and fixed (75b4956 to 03d9087)
- `drawnLater` doc 153 to 155-160 (the option is line 160).
- `areaOf` 94 to 99, in 02 and 03.
- `loadCoachCoachHelm`'s `topInsights` call 538 to 536.
- `pulseLater` 735 to 736.
- `toChInsight` 299 to 272.
- `workingOf` "around 60" to 189.
- `readThemes` 76 to 77.
- Course select: only `course_id` is new.
- In the new section: types are at `src/lib/types/database.ts`.

## 3. New held migrations
None. Legs use Team Stats' round source, so the held `20261024151000_golf_player_standing_season` isn't needed. Option B in 02 §4.3 would wait on it.

## 4. Product calls
- Still open from 02 §4.3: which source feeds the strokes by area? Options: A, Team Stats rounds (one number across Stats and CoachHelm, no held table); B, Standing's season table. My pick: A.
- Made as an engineering call: Re-check stays under the board, not inside the record card.

## 5. Shared-file text for the lead
- To the Stats lane (owner of `src/clubhouse/data/season.ts`): "Add `course_id` to `ROUND_COLUMNS` (one additive column). Team's Course tab groups by it."
- To the Practice lane, and in START_HERE's handoffs: "CoachHelm's 'Add to practice' (the Team pattern, the shared read sheet and the Read Do card) opens S-PRC.drill-bank-sheet filtered to the suggestion, as practice-plan 05 Handoffs says, through one href Practice exports from its own module. CoachHelm passes the insight id or step and the player ids. Until that href exists, the button is absent." Team 02 names `practicePlanHref({ step, playerIds })`; Practice's 05 names drill id and source. The Practice lane should pick one signature.
- START_HERE links row: the same `readHref` and `playerFileHref` text as the Read report.
