# P-6 — Live rounds: hand-offs

What other work packages and the native shell need from Live rounds (P-6), and what P-6 needs from them.

## Lock Screen / Live Activity contract (build plan 8.18)

P-6 builds no native code. The data a Live Activity would read is `toActivityState(lane)` in
`src/clubhouse/live/model.ts`, the same function the own card uses:

| Field | Meaning |
| --- | --- |
| `toPar` | Strokes against par over the holes scored; `null` before the first score |
| `thru` | Holes scored (played means scored; a hole row with a null score is unplayed) |
| `lastHoles` | The last three holes with a score, in play order: `{ n, score, par }` |
| `next` | The next hole to play: `{ hole, par, yds }`, or `null` when the round is done |
| `phase` | `on_course`, `finished`, `posted` or `stopped` |
| `updatedAt` | When the server last heard from the round (server receive time) |

The source is the `lane` broadcast on the private topic `golf-live:coach:<team>` or `golf-live:team:<team>`, or the
20 s poll while the channel is down. `current_hole` is a hole number (payload key `cur`). Nothing here reads location.
The native work (an ActivityKit target and the push-to-start token) is not started and is not part of P-6.

## Hand-off to 4.33 (tournaments)

- A tracked tournament round (one with a row in `public.golf_tournament_player_rounds`) gets no live row from P-6: the
  refresh function checks `to_regclass('public.golf_tournament_player_rounds')` and runs the lookup as dynamic SQL, so it
  compiles before 4.33 lands. Until the table exists every tournament round is untracked and keeps a P-6 lane.
- Home shows one row per live tracked event (CH-16685, "{event} · live") linking to
  `/golf/dashboard/tournaments/<id>/live`. **4.33 must expose that tournament id** and serve that route; P-6 reads the
  tournament name and id from `golf_tournaments` through `golf_tournament_rounds` and `golf_tournament_player_rounds`.
- 4.33's FieldLadder marks the viewer's row with a 2 px rule. Replace it with a `--ch-bg-selected` fill (no left-border
  accent, the selected-state rule), and use `--ch-live-bead-eagle` (#b84d3f in dark mode) for eagle beads.

## Open for the owner (defaults taken)

See the P-6 report: team sharing for practice only, strokes gained on the own card for practice only, no hiding a
qualifier from coaches, no coach Dock twin, no per-hole pushes; version 2 of both open calls ("Not live" with
CH-16684, and tracked tournament rounds excluded with the Home event row CH-16685).

## Not done

- The device pass (iPhone Safari, the iOS shell, the Simulator) and screenshots: no browser or device was run.
- Held migrations 1 to 3 are written and verified on a scratch Postgres only (`supabase/migrations/HELD.md`).
  `database.ts` is regenerated after they are applied.
