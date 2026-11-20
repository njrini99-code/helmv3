# P013 CoachHelm — Changelog

## 2026-11-19 — CoachHelm loads in one shape on desktop

```text
Design package: none
PR/commit: agent/coachhelm-desk-skeleton
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The coach's Team page has one skeleton, `TeamBoardSkeleton`. The route's
  `loading.tsx`, the route's Suspense (`chained`) and the switch all draw
  it. `loading.tsx` drew the retired board's shape (players beside a
  focus card, a 195px head) until the page swapped it about 0.8 s in.
- `TeamBoardSkeleton` on a desk is the board's own grid: the same
  `.dgrid` and `.dcol`s, and the same cards on their own classes in the
  board's order. The hole's drawing waits at the hole's own aspect, and
  each card waits at its loaded height. The scope line waits in the top
  bar. It imports its stylesheet, so the route's first frame has its grid.
- This week, Working on and the Track record wait in their own card
  shapes (`TodayWait`, `WorkWait`, `RecordWait`), not a 120px block.
- `loadCoachTeamBoard` starts the brief and the Track record when the
  roster answers, beside the reads that need only the ids. It still asks
  the gate first. They started after the board's reads and landed about
  1.4 s after the board.
- The player's Board ("Your week") has its own skeleton,
  `file/YourWeekSkeleton.tsx`: the week's `.ch-hf` frame, its tight head
  and its two columns of cards in the week's order. It drew the retired
  focus-and-list board.
- Team reads (`?view=team-reads`) has its own skeleton,
  `TeamReadsSkeleton`, on the page's own frame and whole head. It drew the
  retired board's. The Track record and the briefs keep the old one.
- On a phone the coach's route skeleton is the Team sheet's, not the
  retired chips and focus card.
- A chained skeleton's blocks do not wait the busy delay a second time
  (`.ch-htb[data-skel='chained'] .skl`, `.ch-hf[data-skel='chained'] .sk i`).
- `.ch-hf .sk i` lines are `calc(12 * var(--ch-type-k, 1px))` tall.
  `calc(12px * var(--ch-type-k))` multiplied px by px, so the declaration
  was dropped and every line of the file's skeleton drew 0px tall.
- Both skeletons crossfade with the page on the quick beat
  (`data-ch-arrive="crossfade"`, RouteFrame), not a fade up from canvas.

### Why

- Owner: on desktop the CoachHelm skeleton "doesn't match and it
  flickers". On the coach's first visit (WebKit 1440, staging), the page
  went through three skeletons and a blank. First the retired board's
  shape, then 150 ms of nothing, then the Team grid in a different
  shape. The board then faded up from canvas over three 120px blocks.
  About 1.4 s later This week and Working on landed, and the huddle
  dropped 663px.

### Verification

- Tier W (Playwright WebKit, production build, staging), coach 1440 and
  1920. First visit, revisit within 30 s, revisit after 30 s: one
  skeleton, one crossfade. No box moves after the board lands.
- The skeleton's cards against the landed board's: at 1440 every card
  lands at its own height except the huddle (5px short); at 1920 the hole
  is 4px short. The page is within 5px of its landed height (2012 of
  2017px at 1440, 2056 of 2056px at 1920).
- Player (WebKit 1440 and 1920): one skeleton, chained, one crossfade.
  Staging's one demo player has no rounds, so the week lands as its empty
  state and the cards' heights could not be measured against data.
- Tier C (Chromium) coach 1440: the same sequence.
- Board paint against settle, WebKit 1440 first visit: the board painted
  at about 3.3 s and moved again at 4.5 to 4.7 s (2 runs). After, it
  paints at 2.7 to 3.9 s (4 runs) and does not move again. The brief now
  reads beside the board's reads. This week and Working on wait at this
  team's heights (311 and 592px), so a brief that is still out when the
  board lands can still move the huddle on another roster.
- Not measured: a hard load (the recorder caught no frames), the phone
  in a browser (the shape test and the motion gate cover it), and Team
  reads in a browser (only unit-tested).
- `screens/coachhelm/team/__tests__/skeleton-shape.test.tsx`: each
  skeleton's cards follow its page's order on desk and phone.
