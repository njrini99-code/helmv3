# 2026-11-07 — tournaments

## 2026-11-07 — The last placeholders become working screens

```text
Design package: design/handoff (v3) boards where they draw the view; the plan's sections 5.2, 5.3, 5.11, 5.12 and 5L where they do not
PR/commit:      agent/ch-tournaments
Contract IDs:   see the catalog rows CH-16038, CH-16039, CH-16060 to CH-16064, CH-16070, CH-16071, CH-16238, CH-16338, CH-16362 to CH-16363, CH-16370, CH-16390 to CH-16392
Actions:        none new; the screens call the existing tournaments server actions (src/app/golf/actions/tournaments.ts)
Data impact:    link rows carry their event round id (`ChTourLinksData`); the lineup carries the event version; the live and player loaders read more of the tournament's own rows
Held items:     the player's reveal and reflections need held file 4 (20261024100300), see supabase/migrations/HELD.md
```

Link rounds, Edit event, the lineup builder, the live round and the player's
Tournaments are built; `TourPlaceholder`
and its catalog row CH-16301 are gone. Each screen reads and writes the rows
Fairway uses, through the same actions, so the
two surfaces stay in step: nothing here writes a table the actions do not.

Owner answers A and B (2026-11-07), same day: a player sees the published lineup
(their role, spot, and whether their score
counted, round by round) through the held `20261024100300` migration
(`golf_tournament_my_lineup`, written, not applied;
until it is applied the page says the lineup is not shown yet); and the live
round scores hole by hole. Hole scores go into
`golf_holes` on the player's own `golf_rounds` row and link to the tournament
round, through `saveTournamentHole` (new,
`src/app/golf/actions/tournaments-holes.ts`); the coach scores any player in the
round and a player scores themselves
(Your card on their event page). No new score store: the live-rounds realtime
topics skip tournament rounds a tournament
tracks, and `golf_holes` is not in the realtime publication, so the 30-second
re-read stays. A card with every hole scored
reads as finished (its total is the holes' sum); the round stays in progress in
Fairway, because only the protected
round-submit flow completes a round. Hole-by-hole is offered only when the
course's holes are known.

Not drawn, because the data does not exist yet (nothing is invented): the
lineup's count-chance band and projection
range (the engines need six rounds and the held projections), drag between slots
(a select and the keyboard do it on every
device), the live hole map, moments and presence (the broadcast hole feed is
held file 6; hole scores themselves are drawn), and, until the held reveal
migration is
applied, the player's lineup reveal.
