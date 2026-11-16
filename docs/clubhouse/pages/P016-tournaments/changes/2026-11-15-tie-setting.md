# 2026-11-15 — tournament Ties setting log

## 2026-11-15 — Ties on a tournament, and the field's shared places (launch readiness F-04)

```text
Design package: none (launch readiness findings, 15 Nov 2026, §4 F-04); no owner board. Built from Select and the fields' help line only
PR/commit:      claude/project-thread-8hytxy (QUEUE lr-f04)
Contract IDs:   none new (the ladder itself is 16xxx standings, unchanged)
Actions:        none new; the event form's create and edit saves carry the tiebreak
Data impact:    writes golf_tournaments.tiebreak through the existing update RPC (golf_tournament_update); no schema change
Held items:     none
```

### Changed

- **More details › Ties** on the tournament form (new event, edit event and the
  calendar's tournament section): **Tied teams share a place** (the default, as
  every event has been) or **NCAA tiebreakers**, with a sentence saying what it
  does. An event that already has a playoff keeps it as a third choice, so
  opening and saving it never changes it.
- NCAA tiebreakers are the Division I championships' order: a team by its
  non-counting scores, then each round's lowest, second, third and fourth
  counting scores, then seed; a player by the last round, then the round before.
  The results import already places a field by it (F-01) when the event is set
  to NCAA; this is the first place a coach can set it.
- The create RPC takes no tiebreak, so a create sets it right after through the
  event's update on the version the create returned. If that step fails the
  event stands on shared places and the saved toast says "Its tiebreak didn’t
  save, so tied places are shared. Set Ties again in Edit."
- The live round's field says why a place is still shared under an event that
  separates ties: field rows carry totals only, so the tie stays until the
  results are imported or the host's places are entered.

### Why

- The NCAA tie ladder was wired into the import but no coach could turn it on.

### Verification

- `src/clubhouse/screens/tournaments/fields/__tests__/rounds-model.test.ts`
  (the field's options, help and payload),
  `src/clubhouse/screens/tournaments/__tests__/edit-model-ties.test.ts` (edit
  round trip), `src/app/golf/actions/__tests__/tournaments-calendar.test.ts`
  (the create's follow-up update, a replay, a failure),
  `src/clubhouse/__tests__/tournaments-live.test.tsx` (the field note).
- Not yet: real-app screenshots on staging.
