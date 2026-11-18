# P013 — Changelog

## 2026-11-15 — One view switch, mounted once above the view (N13C-67, N13P-18)

```text
Design package: production audit 2026-11-15, rows P1-7 and P1-19 (and P2-70, below)
PR/commit: claude/project-thread-10vtd2-motion-2 (worker G, CoachHelm switch)
Contract IDs: CH-13304, CH-13305, CH-13402, CH-R1
Actions: none
Data impact: none (the idle prefetch is the route's own, which stops at the loading boundary; no loader runs ahead of a tap)
Held items: N13-13 (the board's hero-first split), not in this change
```

### Changed

- `screens/coachhelm/SwitchStrip.tsx` (new): the one switch row, `.ch-hsw`. On a
  desk it is the first thing in the glass top bar (`DeskTop`); on the phone a 52
  px row under the bar. `held` draws it inert for loading.tsx.
  `useCoachHelmSwitchOff` lets a view that finds CoachHelm off hide it.
- `screens/coachhelm/SwitchFrame.tsx` (new): the frame the route mounts once
  above the coach's Team and Ask and the player's Board, Standing, Deep dive and
  Ask. It runs `useViewSwitch` and `useBusy`: a tap moves the switch at once and
  the view under it becomes the next view's skeleton in the same commit; the
  skeleton's blocks wait 150 ms and hold at least 300 ms once shown.
- `routes/coachhelm.tsx`: each switch view returns inside the frame. The page
  segment is not keyed by its query, so the frame and its switch stay mounted
  while `?view=` changes.
- `use-view-switch.ts`: the idle prefetch of the other views uses the route's
  own prefetch for a CoachHelm address (CH-R1 refuses a whole fetch, because its
  loaders record what they show) and keeps the whole fetch for addresses that
  allow it.
- `team/TeamBoard.tsx`, `file/YourWeek.tsx`, `views/Frame.tsx` (player mode),
  `chat/Ask.tsx`: no longer draw their own switch. A coach's view of one player
  keeps its own strip in its header.
- Skeletons (`CoachHelmSkeleton.tsx`, `chat/AskSkeleton.tsx`,
  `team/TeamBoardSkeleton.tsx`, `views/Skeletons.tsx`): the switch is no longer
  drawn inside each skeleton; loading.tsx draws the held switch in the frame's
  place above it.
- `styles/coachhelm.css`: the `.ch-hsw` row (31 lines added, no keyframes, no
  transitions). `styles/coachhelm-ask.css`: Ask's phone height is 52 px shorter
  under the row (3 rules, 11 lines added).

### Why

- P1-7, P1-19: the switch sat in a different place on each view (the player's at
  x 884, 822 and 66 on Board, Standing and Ask) and was drawn again on every
  switch; a tap held the old view, dimmed, for 2.7 to 3.3 s while the server
  rendered the next.

### Verification

- Unit: `screens/coachhelm/__tests__/switch-frame.test.tsx` (the same switch
  element across a view change, the player's row before the view, the idle
  prefetch with the route's own prefetch, a tap's skeleton in the same commit,
  the 300 ms hold, off hides it), plus the CoachHelm suites whose pinned
  structure this changes (each edit cites N13C-67 or N13P-18) and the four
  motion tests.
- Engine tier: no browser run here. W is owed on `/golf/dashboard/coachhelm`
  (coach: Team, `?view=ask`; player: Board, `?view=standing`, `?view=deep-dive`,
  `?view=ask`) at 1440 and 402: the switch in the same place on every view, a
  tap showing the next view's skeleton frame in the first frame, and Ask on the
  phone not scrolling the page.
